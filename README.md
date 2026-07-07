<p align="center" style="margin-top: 120px">

  <h3 align="center">openstatus</h3>

  <p align="center">The open-source status page and uptime monitoring platform.
    <br />
    <a href="https://www.openstatus.dev"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="https://www.openstatus.dev/docs">Documentation</a>
    ·
    <a href="https://www.openstatus.dev">Website</a>
    ·
    <a href="https://www.openstatus.dev/discord">Discord</a>
  </p>

  <p align="center">
  <a href="https://status.openstatus.dev"><img src="https://status.openstatus.dev/badge/v2?variant=outline" alt="openstatus status"></a>

  </p>
  <p align="center">
      <a href="https://github.com/openstatushq/openstatus/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License"></a>
      <a href="https://github.com/openstatushq/openstatus/stargazers"><img src="https://img.shields.io/github/stars/openstatushq/openstatus?style=social" alt="GitHub stars"></a>
      <a href="https://www.openstatus.dev/discord"><img src="https://img.shields.io/discord/1129008226264940625?color=7289da&logo=discord&logoColor=white" alt="Discord"></a>
</p>

## About openstatus

openstatus is an open-source platform that combines **status pages** and **uptime monitoring** in a single tool. Keep your users informed and your services reliable. Available as a managed service or self-hosted.

<p align="center">
  <img src="https://www.openstatus.dev/assets/landing/statuspage-meow.png" alt="openstatus status page" width="720" />
</p>

## Why openstatus?

- **Status pages + monitoring in one tool** — no need to wire up a separate monitoring service
- **28 global regions** checking in parallel across 3 cloud providers
- **Flat pricing, unlimited members** — no per-seat or per-subscriber charges
- **Open source & self-hostable** — AGPL-3.0, private-locations run in a single 8.5MB Docker image
- **Monitoring as code** — YAML config, CLI, GitHub Actions, Terraform
- **Incident communication** — subscriber notifications via email, RSS, and webhooks

### Status pages

Beautiful, customizable status pages with custom domains, password protection, maintenance windows, and subscriber notifications via email and RSS. Build trust and keep your users informed during incidents.

### Uptime Monitoring

Monitor your servers, websites and APIs from 28 regions across multiple cloud providers globally. Get notified via Slack, Discord, PagerDuty, email, and more when your services are down or slow.

## Recognitions

<a href="https://trendshift.io/repositories/1780" target="_blank"><img src="https://trendshift.io/api/badge/repositories/1780" alt="openstatus | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
<a href="https://news.ycombinator.com/item?id=37740870"><img alt="Featured on Hacker News" src="https://hackerbadge.now.sh/api?id=37740870" style="width: 250px; height: 55px;" width="250" height="55" /></a>
<a href="https://www.producthunt.com/posts/openstatus-2?utm_source=badge-top-post-badge&utm_medium=badge" target="_blank"><img alt="openstatus - #2 Product of the Day on Product Hunt" src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=openstatus-2&theme=light&period=daily" style="width: 250px; height: 55px;" width="250" height="55" /></a>

## Getting Started

### Which deployment method?

| I want to… | Use |
|---|---|
| Self-host everything with full control | [Docker Compose (Full)](#option-1-docker-compose-full-stack) |
| Self-host without build toolchain | [Docker Compose (Pre-Built)](#option-2-docker-compose-pre-built-images) |
| Try it out quickly, no analytics needed | [Docker Compose (Lightweight)](#option-3-docker-compose-lightweight) |
| Deploy on Coolify | [Coolify](#option-4-coolify) |
| Monitor targets in private/internal networks | [Private Probe](#option-5-private-probe-independent-server) |
| Develop or contribute code | [Development Setup](#development-setup) |
| No ops — use the managed service | [openstatus.dev](https://www.openstatus.dev) |

---

### Option 1: Docker Compose (Full Stack)

All 14 services — analytics, probes, Redis, database, dashboard, and status page.
Builds from source. **Best for production self-hosting.**

```sh
cp .env.docker.example .env.docker
# Edit .env.docker — set AUTH_SECRET and email config
docker compose up -d
open http://localhost:3002  # Dashboard
```

**Requires:** Docker, `DOCKER_BUILDKIT=1`. **Full guide:** [DOCKER.md](DOCKER.md)

### Option 2: Docker Compose (Pre-Built Images)

Same services as the full stack, but pulls pre-built images from GitHub Container
Registry. **No build toolchain needed.**

```sh
cp .env.docker.example .env.docker
docker compose -f docker-compose.github-packages.yaml up -d
open http://localhost:3002
```

**Requires:** Docker only. **Images:** `ghcr.io/openstatushq/openstatus-*`.
**Full guide:** [DOCKER.md](DOCKER.md)

### Option 3: Docker Compose (Lightweight)

Minimal deployment — dashboard, status page, and database only.
No analytics, no probes, no Redis. **Best for quick evaluation.**

```sh
cp .env.docker.example .env.docker
docker compose -f docker-compose-lightweight.yaml up -d
open http://localhost:3000  # Dashboard
open http://localhost:3001  # Status Page
```

**Requires:** Docker. **Full guide:** [DOCKER.md](DOCKER.md)

### Option 4: Coolify

Two paths available:

- **One-file import** — Point Coolify at [`coolify-deployment.yaml`](coolify-deployment.yaml).
  Fastest setup: imports all services with pre-built images.
- **Manual setup** — Configure each service individually using
  `ghcr.io/openstatushq/openstatus-*` images.

**Full guide:** [COOLIFY_DEPLOYMENT.md](COOLIFY_DEPLOYMENT.md)

### Option 5: Private Probe (Independent Server)

Deploy a **single 15 MB container** on any server to monitor targets inside your
private network, behind firewalls, or from a specific location. The probe connects
back to your main OpenStatus deployment. **No database, no Tinybird, no volumes.**

```yaml
# docker-compose.probe.yaml — on the probe server
services:
  private-probe:
    image: ghcr.io/openstatushq/openstatus-checker:latest
    entrypoint: ["/opt/bin/probe"]
    environment:
      - OPENSTATUS_KEY=<token-from-dashboard>
      - OPENSTATUS_INGEST_URL=https://pl.yourdomain.com
```

**Full guide:** [docs/private-probe-independent-deployment.md](docs/private-probe-independent-deployment.md)

---

### Development Setup

#### Requirements

- [Node.js](https://nodejs.org/en/) >= 20.0.0
- [pnpm](https://pnpm.io/) >= 8.6.2
- [Bun](https://bun.sh/)
- [Turso CLI](https://docs.turso.tech/quickstart)

#### Setup

1. Clone the repository

```sh
git clone https://github.com/openstatushq/openstatus.git
```

2. Install dependencies

```sh
pnpm install
```

3. Initialize the development environment

```sh
# Starts libSQL (port 8080), Tinybird local, and applies database migrations
pnpm dx
```

4. Launch the app you want to work on:

```sh
pnpm dev:dashboard
pnpm dev:status-page
pnpm dev:web
```

> **Note:** `pnpm dx` starts its own libSQL instance on port 8080 via process-compose.
> If you need a standalone libSQL instance, use `turso dev --port 8081 --db-file openstatus-dev.db`
> to avoid port conflicts.

5. See the results:

- Dashboard: [http://localhost:3000](http://localhost:3000) (default port)

## Tech Stack

- [Next.js](https://nextjs.org/) - Dashboard
- [Hono](https://hono.dev/) - API server
- [Go](https://go.dev/) - Checker
- [Turso](https://turso.tech/) - Database
- [Drizzle](https://orm.drizzle.team/) - ORM
- [Tinybird](https://tinybird.co/?ref=openstatus.dev) - Analytics
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - UI components

## Contributing

If you want to help us build the best status page and monitoring platform, check our [contributing guidelines](https://github.com/openstatusHQ/openstatus/blob/main/CONTRIBUTING.MD).

<a href="https://github.com/openstatushq/openstatus/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=openstatushq/openstatus" />
</a>

![openstatus repository activity](https://repobeats.axiom.co/api/embed/180eee159c0128f683a30f15f51ac35bdbd9fa44.svg "Repobeats analytics image")

## Contact

Interested in our enterprise plan or need special features? Email us at [ping@openstatus.dev](mailto:ping@openstatus.dev) or book a call.

<a href="https://cal.com/team/openstatus/30min"><img alt="Book us with Cal.com" src="https://cal.com/book-with-cal-dark.svg" /></a>

## License

Distributed under the [AGPL-3.0 License](LICENSE).
