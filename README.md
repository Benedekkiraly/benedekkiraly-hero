# benedekkiraly-hero

One-screen personal page: a chrome blob that reacts to the pointer, built with
[vgpu](https://vgpu.sh) (WebGPU). It needs a WebGPU browser (current Chrome, Edge or Safari).

## Publish on GitHub Pages

The built site is already in `docs/`, including the vgpu library (bundled into the JS file).

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/docs`
3. Save. The site goes live at `https://<your-user>.github.io/<repo-name>/`

## Change things

Text and links live in `src/content.ts`. After editing:

```bash
npm install
npm run build   # rebuilds docs/
```

Commit the updated `docs/` folder to publish the change. `npm run dev` runs it locally.
