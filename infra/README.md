# Infra

Terraform for Shardfall's Cloudflare resources, applied from GitHub (same layout as pywire.dev).
State lives in R2: bucket `shardfall-tfstate`, key `magicite.tfstate`, with native S3 locking.
The bucket is created once by hand (chicken-and-egg). **Terraform >= 1.10 required.**

| Resource | What | Who uploads the contents |
|---|---|---|
| `cloudflare_calls_turn_app.turn` | Cloudflare Realtime TURN key (1,000 GB/month free) | Terraform (the key is a computed output) |
| `cloudflare_workers_script.signal` | `shardfall-signal` Worker: Nostr signaling relay (Durable Object) + `/ice` TURN credentials | wrangler (`server/cloudflare/`), from **Infra apply** and **Deploy signal relay** |
| `cloudflare_pages_project.web` | `shardfall` Pages project: the web build at https://shardfall.pages.dev | `wrangler pages deploy` from **Deploy web** |

The Worker follows pywire.dev's demo pattern. Terraform creates it with a 503 placeholder and never
touches it again (`ignore_changes = all`). Wrangler uploads the real code, because it applies Durable
Object migrations correctly and every upload replaces what Terraform would have set. The TURN key
goes from Terraform's state straight into the Worker's `TURN_KEY_ID` / `TURN_KEY_TOKEN` secrets
inside the apply workflow, so it is never a repo secret.

## Daily flow

- PRs touching `infra/` or the relay code get a **plan comment** (it never fails the PR).
- After merging infra changes, run **Infra apply** (Actions → Infra apply → Run workflow). It applies,
  checks the plan is empty, deploys the Worker, sets the TURN secrets, smoke-tests `/health` and
  `/ice`, and prints the relay and ICE URLs in the run summary.
- Pushes to `main` that change `server/cloudflare/**` or `server/relayHub.ts` redeploy the Worker
  (**Deploy signal relay**). Every push to `main` redeploys the web build (**Deploy web**).
- A weekly check opens a "Terraform drift on main" issue if the live state diverges.

## One-time setup

1. **State bucket** (once): Cloudflare dashboard → R2 → Create bucket `shardfall-tfstate`, or
   `npx wrangler r2 bucket create shardfall-tfstate`. Then create an **R2 API token** with
   *Object Read & Write* scoped to that bucket only.
2. **API token**: an account token with the permissions in [Token permissions](#token-permissions).
3. **Repo secrets** (Settings → Secrets and variables → Actions):

   | Secret | Purpose |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | provider + wrangler auth |
   | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | state backend |

4. **Repo variables**:

   | Variable | Value |
   |---|---|
   | `CLOUDFLARE_ACCOUNT_ID` | `abd8226d8d910afcfa1d370097e6336a`. This also switches on the deploy workflows. |
   | `NOSTR_RELAYS` | from the Infra apply summary, e.g. `wss://shardfall-signal.<you>.workers.dev` |
   | `ICE_ENDPOINT` | from the Infra apply summary, e.g. `https://shardfall-signal.<you>.workers.dev/ice` |

5. Run **Infra apply**, copy the two URLs from its summary into the variables, then re-run
   **Deploy web** (and cut a desktop release) so the builds pick them up.

**Different account?** The account id appears in three places: `infra.auto.tfvars`, the backend
`endpoints` in `main.tf` (which can't read variables), and the `CLOUDFLARE_ACCOUNT_ID` variable.

## Token permissions

`CLOUDFLARE_API_TOKEN` must be an **account token**. Dashboard picker names (2026):

| Scope | Permission |
|---|---|
| Account | Workers Scripts: Write |
| Account | Cloudflare Pages: Write |
| Account | Calls: Write (Realtime / TURN keys) |

No zone permissions are needed: everything is on `*.workers.dev` / `*.pages.dev`. If you add a
custom domain later, add Zone → DNS: Write and Workers Routes: Write, as pywire.dev has.

## Local runs

`terraform.tfvars` is gitignored (it holds the token). Non-secret values are committed in
`infra.auto.tfvars`, and a local `terraform.tfvars` overrides them.

```sh
cat > backend.secrets <<'EOF'
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
EOF
set -a; . ./backend.secrets; set +a; rm backend.secrets
echo 'cloudflare_api_token = "..."' > terraform.tfvars
terraform init
terraform plan
```

The lock file pins provider 5.27.0 with hashes for every platform, so `init` works on macOS,
Linux and Windows alike.

## Break glass

- Stuck lock: `terraform force-unlock <LOCK_ID>`. The lock object is `magicite.tfstate.tflock`
  in the bucket.
- Lost TURN key (e.g. after re-importing the TURN app): `terraform apply -replace=cloudflare_calls_turn_app.turn`,
  then run **Infra apply** to push the new key to the Worker.

## Known wrinkles

- `cloudflare_calls_turn_app.key` is returned only when the app is created. It survives in state,
  but an import can't recover it (see Break glass).
- The Pages project is direct-upload. If a provider upgrade starts demanding `build_config`
  (pywire.dev hit this on 5.16), copy its inert `build_config` block.
- GitHub Pages (`pages.yml`) is the other web target. Keep whichever you use: the Cloudflare Pages
  project needs no environment protection rules.
