import { defineConfig } from 'vite';

export default defineConfig({
  // dist/ をどの静的ホスト（GitHub Pages のサブパス配信等）に置いても相対パスで動くように。
  base: './',
});
