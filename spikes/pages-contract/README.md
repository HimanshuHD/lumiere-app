# Archived GitHub Pages contract proof (#45)

The synthetic fixture exercises hash routing and OAuth return handling with simulated data. The hosted proof is complete. The application Pages workflow now owns deployment.

```sh
npm ci --include=dev
node --test tests/pages-contract.test.ts
npx vite build --config spikes/pages-contract/vite.config.ts
npx vite preview --config spikes/pages-contract/vite.config.ts
```

The fixture base is `/lumiere-app/`. In a browser open the local preview at `http://localhost:4173/lumiere-app/` (use actual printed port). Verify that CSS and JS load with the correct base, and use DevTools Network to check missing assets do not return entry HTML.


[Hosted proof and acceptance evidence](https://github.com/HimanshuHD/lumiere-app/issues/45)
