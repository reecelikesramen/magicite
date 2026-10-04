output "signal_worker_name" {
  value = cloudflare_workers_script.signal.script_name
}

output "pages_url" {
  value = "https://${cloudflare_pages_project.web.subdomain}"
}

# Read by the Infra apply workflow and stored as the Worker's TURN_KEY_ID / TURN_KEY_TOKEN secrets.
output "turn_key_id" {
  value = cloudflare_calls_turn_app.turn.uid
}

output "turn_key_token" {
  value     = cloudflare_calls_turn_app.turn.key
  sensitive = true
}

output "account_id" {
  value = var.account_id
}
