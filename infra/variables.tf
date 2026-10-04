variable "account_id" {
  type = string
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "signal_worker_name" {
  description = "Worker serving the signaling relay (wss://<name>.<account>.workers.dev) and /ice"
  type        = string
  default     = "shardfall-signal"
}

variable "pages_project_name" {
  description = "Cloudflare Pages project for the web build (https://<name>.pages.dev)"
  type        = string
  default     = "shardfall"
}
