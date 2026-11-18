/// <reference types="vite/client" />

declare module "monaco-editor/editor/editor.worker?worker" {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}
