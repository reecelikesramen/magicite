terraform {
  required_version = ">= 1.10" # backend use_lockfile needs native S3 locking

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.27" # pinned by .terraform.lock.hcl
    }
  }

  # Remote state on R2 (same layout as pywire.dev). The shardfall-tfstate bucket is created once
  # by hand (chicken-and-egg) — see infra/README.md. Access keys come from the environment
  # (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). The endpoint embeds the account id.
  backend "s3" {
    bucket                      = "shardfall-tfstate"
    key                         = "magicite.tfstate"
    region                      = "auto"
    endpoints                   = { s3 = "https://abd8226d8d910afcfa1d370097e6336a.r2.cloudflarestorage.com" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    use_lockfile                = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# --- 1. TURN (Cloudflare Realtime) -------------------------------------------------------------
# Relays WebRTC traffic for the ~10–20% of player pairs whose NATs can't connect directly.
# 1,000 GB/month free. The key never leaves Cloudflare/state: the apply workflow hands it to the
# signal Worker as secrets, and the Worker mints short-lived credentials at /ice.
resource "cloudflare_calls_turn_app" "turn" {
  account_id = var.account_id
  name       = "shardfall-turn"
}

# --- 2. Signaling relay (Worker + Durable Object) ----------------------------------------------
# Terraform owns the script's existence; its code, Durable Object binding/migration and secrets
# are uploaded by wrangler (server/cloudflare/wrangler.toml) from the Infra apply and Deploy signal
# workflows — wrangler applies DO migrations correctly, and uploads replace everything Terraform
# would set. Like pywire.dev's demo Workers, the placeholder answers 503 until the first deploy
# and Terraform never touches the script after creating it.
resource "cloudflare_workers_script" "signal" {
  account_id         = var.account_id
  script_name        = var.signal_worker_name
  main_module        = "placeholder.js"
  compatibility_date = "2026-09-01"
  content            = <<-JS
    export default {
      fetch() {
        return new Response("Signal relay not deployed yet.", { status: 503 });
      },
    };
  JS

  lifecycle {
    ignore_changes = all
  }
}

# --- 3. Web build (Cloudflare Pages, direct upload) --------------------------------------------
# GitHub Actions builds the game and deploys it (deploy-web.yml); no Cloudflare-side Git hookup.
resource "cloudflare_pages_project" "web" {
  account_id        = var.account_id
  name              = var.pages_project_name
  production_branch = "main"
}
