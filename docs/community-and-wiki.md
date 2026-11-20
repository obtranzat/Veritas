# Veritas Community, Support & GitHub Wiki Structure

Welcome to the Veritas open-source community.

---

## 1. Communication Channels

| Need | Recommended Channel |
| :--- | :--- |
| **Bug Reports** | [GitHub Issues — Bug Report](../.github/ISSUE_TEMPLATE/bug_report.yml) |
| **Feature Proposals & RFCs** | [GitHub Issues — Feature Request](../.github/ISSUE_TEMPLATE/feature_request.yml) or GitHub Discussions (`Ideas`) |
| **Usage Help & Self-Hosting Q&A** | GitHub Discussions (`Q&A`) |
| **Documentation Fixes** | [GitHub Issues — Documentation](../.github/ISSUE_TEMPLATE/documentation.yml) |
| **Security Vulnerabilities** | Email `gaikhomun@gmail.com` or GitHub Private Security Advisory — see [`SECURITY.md`](../SECURITY.md) |

---

## 2. GitHub Discussions Setup

Maintainers enabling GitHub Discussions on the repository can mirror the categories documented in [`.github/DISCUSSION_CATEGORIES.md`](../.github/DISCUSSION_CATEGORIES.md):
- **Announcements** (Releases & advisories)
- **Q&A** (Installation, Docker, Kubernetes, Ollama setup)
- **Ideas** (New detection signals, export formats, MCP tools)
- **Show and Tell** (LMS/CMS integrations, research benchmarks)

---

## 3. Recommended GitHub Wiki Mirror Map

All canonical documentation lives version-controlled under [`docs/`](./README.md) so pull requests update code and docs together. If mirroring to a GitHub Wiki, map pages cleanly as follows:

| Wiki Page Title | Source Markdown File |
| :--- | :--- |
| `Home` | [`README.md`](../README.md) & [`docs/README.md`](./README.md) |
| `Getting-Started` | [`docs/getting-started.md`](./getting-started.md) |
| `Installation-Guide` | [`docs/installation-guide.md`](./installation-guide.md) |
| `Configuration-Reference` | [`docs/configuration-guide.md`](./configuration-guide.md) |
| `User-Manual` | [`docs/user-manual.md`](./user-manual.md) |
| `Administrator-Manual` | [`docs/admin-manual.md`](./admin-manual.md) |
| `Developer-Guide` | [`docs/developer-guide.md`](./developer-guide.md) |
| `API-Reference` | [`docs/api-reference.md`](./api-reference.md) |
| `Architecture` | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| `Security-Guide` | [`docs/security-guide.md`](./security-guide.md) |
| `Deployment-Guide` | [`docs/deployment-guide.md`](./deployment-guide.md) |
| `Migration-Guide` | [`docs/migration-guide.md`](./migration-guide.md) |
| `Monitoring-and-Performance` | [`docs/observability-and-monitoring.md`](./observability-and-monitoring.md) |
| `Troubleshooting-and-FAQ` | [`docs/troubleshooting.md`](./troubleshooting.md) |
| `Licensing` | [`docs/licensing.md`](./licensing.md) |

---

## 4. Maintainer Contact

- **Lead Maintainer**: `gaikhomun@gmail.com`
- **Code of Conduct Enforcement**: [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- **Contribution Workflow**: [`CONTRIBUTING.md`](../CONTRIBUTING.md)
