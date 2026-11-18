use std::collections::HashMap;
use std::net::TcpListener;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::models::{SshAuthMethod, SshTunnelConfig};

pub const NAVICAT_TUNNEL_MAGIC: u32 = 1111;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpTunnelHeader {
    pub magic: u32,
    pub version: u16,
    pub errno: u32,
}

/// Binary packet codec compatible with Navicat `ntunnel_mysql.php` (v207) and `ntunnel_pgsql.php` (v204).
pub struct HttpTunnelPacketCodec;

impl HttpTunnelPacketCodec {
    /// Encode a byte payload using Navicat's variable-length block framing.
    pub fn encode_block(data: &[u8]) -> Vec<u8> {
        let len = data.len();
        if len < 254 {
            let mut out = Vec::with_capacity(1 + len);
            out.push(len as u8);
            out.extend_from_slice(data);
            out
        } else {
            let mut out = Vec::with_capacity(5 + len);
            out.push(0xFE);
            out.extend_from_slice(&(len as u32).to_be_bytes());
            out.extend_from_slice(data);
            out
        }
    }

    /// Decode a block (`None` represents `0xFF` SQL NULL). Returns `(decoded_block, bytes_consumed)`.
    pub fn decode_block(input: &[u8]) -> Result<(Option<Vec<u8>>, usize), String> {
        let first = *input.first().ok_or_else(|| "Unexpected EOF reading block tag".to_string())?;
        if first == 0xFF {
            return Ok((None, 1));
        }
        if first == 0xFE {
            if input.len() < 5 {
                return Err("Truncated 32-bit block length".to_string());
            }
            let len = u32::from_be_bytes([input[1], input[2], input[3], input[4]]) as usize;
            let end = 5usize.saturating_add(len);
            if input.len() < end {
                return Err("Truncated block payload".to_string());
            }
            return Ok((Some(input[5..end].to_vec()), end));
        }
        let len = first as usize;
        let end = 1 + len;
        if input.len() < end {
            return Err("Truncated short block payload".to_string());
        }
        Ok((Some(input[1..end].to_vec()), end))
    }

    /// Parse the 16-byte response header emitted by `EchoHeader($errno)`.
    pub fn parse_response_header(buf: &[u8]) -> Result<HttpTunnelHeader, String> {
        if buf.len() < 16 {
            return Err(format!("Expected at least 16 header bytes, got {}", buf.len()));
        }
        let magic = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
        if magic != NAVICAT_TUNNEL_MAGIC {
            return Err(format!("Invalid Navicat HTTP tunnel magic: {magic}"));
        }
        let version = u16::from_be_bytes([buf[4], buf[5]]);
        let errno = u32::from_be_bytes([buf[6], buf[7], buf[8], buf[9]]);
        Ok(HttpTunnelHeader { magic, version, errno })
    }
}

pub struct ActiveTunnel {
    pub local_port: u16,
    pub child: Child,
}

/// Manages local SSH port-forwarding processes across Windows, Linux, and macOS.
#[derive(Clone, Default)]
pub struct SshTunnelManager {
    tunnels: Arc<Mutex<HashMap<String, ActiveTunnel>>>,
}

impl SshTunnelManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn reserve_ephemeral_port() -> Result<u16, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind ephemeral loopback port: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read local port: {e}"))?
            .port();
        drop(listener);
        Ok(port)
    }

    /// Start an SSH `-N -L` tunnel forwarding to `remote_host:remote_port`.
    pub async fn start_tunnel(
        &self,
        tunnel_id: &str,
        ssh: &SshTunnelConfig,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<u16, String> {
        self.stop_tunnel(tunnel_id).await;

        if ssh.host.trim().is_empty() || ssh.username.trim().is_empty() {
            return Err("SSH host and username are required when SSH tunnel is enabled".to_string());
        }

        let local_port = Self::reserve_ephemeral_port()?;
        let forward_spec = format!("127.0.0.1:{local_port}:{remote_host}:{remote_port}");

        let mut cmd = Command::new("ssh");
        cmd.arg("-N")
            .arg("-L")
            .arg(&forward_spec)
            .arg("-p")
            .arg(ssh.port.to_string())
            .arg("-o")
            .arg("ExitOnForwardFailure=yes")
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg("StrictHostKeyChecking=accept-new")
            .arg("-o")
            .arg("ConnectTimeout=10")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());

        match ssh.auth_method {
            SshAuthMethod::PrivateKey => {
                if let Some(key_path) = ssh.private_key_path.as_deref().filter(|s| !s.trim().is_empty()) {
                    cmd.arg("-i").arg(key_path);
                } else {
                    return Err("SSH private key path is required for private key authentication".to_string());
                }
            }
            SshAuthMethod::Password => {
                return Err("SSH password authentication requires an interactive askpass helper or private key authentication in headless BatchMode".to_string());
            }
        }

        cmd.arg(format!("{}@{}", ssh.username.trim(), ssh.host.trim()));

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to launch OpenSSH client (`ssh`): {e}"))?;

        let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
        loop {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("SSH tunnel exited early with status {status}"));
            }
            if TcpStream::connect(("127.0.0.1", local_port)).await.is_ok() {
                break;
            }
            if tokio::time::Instant::now() >= deadline {
                let _ = child.kill().await;
                return Err("Timed out waiting for SSH local port forward".to_string());
            }
            tokio::time::sleep(Duration::from_millis(120)).await;
        }

        let mut guard = self.tunnels.lock().await;
        guard.insert(tunnel_id.to_string(), ActiveTunnel { local_port, child });
        Ok(local_port)
    }

    pub async fn stop_tunnel(&self, tunnel_id: &str) {
        let existing = {
            let mut guard = self.tunnels.lock().await;
            guard.remove(tunnel_id)
        };
        if let Some(mut tunnel) = existing {
            let _ = tunnel.child.kill().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_tunnel_block_roundtrip_short_long_and_null() {
        let short = HttpTunnelPacketCodec::encode_block(b"users");
        assert_eq!(short, b"\x05users");
        let (decoded, consumed) = HttpTunnelPacketCodec::decode_block(&short).unwrap();
        assert_eq!(decoded.as_deref(), Some(b"users".as_slice()));
        assert_eq!(consumed, short.len());

        let long_payload = vec![b'A'; 300];
        let long = HttpTunnelPacketCodec::encode_block(&long_payload);
        assert_eq!(long[0], 0xFE);
        let (decoded_long, consumed_long) = HttpTunnelPacketCodec::decode_block(&long).unwrap();
        assert_eq!(decoded_long.as_ref(), Some(&long_payload));
        assert_eq!(consumed_long, long.len());

        let (decoded_null, consumed_null) = HttpTunnelPacketCodec::decode_block(&[0xFF]).unwrap();
        assert_eq!(decoded_null, None);
        assert_eq!(consumed_null, 1);
    }

    #[test]
    fn http_tunnel_header_parses_magic_and_version() {
        let mut raw = Vec::new();
        raw.extend_from_slice(&1111_u32.to_be_bytes());
        raw.extend_from_slice(&207_u16.to_be_bytes());
        raw.extend_from_slice(&0_u32.to_be_bytes());
        raw.extend_from_slice(&[0u8; 6]);
        let hdr = HttpTunnelPacketCodec::parse_response_header(&raw).unwrap();
        assert_eq!(hdr.magic, 1111);
        assert_eq!(hdr.version, 207);
        assert_eq!(hdr.errno, 0);
    }
}
