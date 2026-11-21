# benedekkiraly-hero

One-screen personal page: a chrome blob that reacts to the pointer, built with
[vgpu](https://vgpu.sh) (WebGPU). It needs a WebGPU browser (current Chrome, Edge or Safari).

## Publish on GitHub Pages

A workflow in `.github/workflows/pages.yml` builds the site with Vite (vgpu is bundled in) and deploys it.
No Jekyll involved.

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main`. The workflow runs and the site goes live at `https://<your-user>.github.io/<repo-name>/`

If you replaced an older Jekyll workflow, delete it so only `pages.yml` remains.

Prefer no Actions? The built site is also committed in `docs/`: set Pages to
**Deploy from a branch, `main`, `/docs`** instead.

## Change things

Text and links live in `src/content.ts`. After editing:

```bash
npm install
npm run build   # rebuilds docs/
```

Commit the updated `docs/` folder to publish the change. `npm run dev` runs it locally.
