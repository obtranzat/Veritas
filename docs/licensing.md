# Veritas Licensing & Open Source Governance

Veritas is distributed under the **MIT License** ([`LICENSE`](../LICENSE)).

---

## 1. Why MIT?

Veritas chooses the **MIT License** to maximize adoption across academic researchers, individual developers, startups, journalism rooms, NGOs, and enterprise security teams with minimal legal friction:

- **Commercial & Institutional Freedom**: Organizations may embed Veritas inside internal LMS platforms, CI/CD gates, publishing CMS pipelines, or commercial SaaS offerings without copyleft propagation.
- **Zero SaaS / Subscription Lock-In**: Every feature — unlimited file detection, humanization, fact-checking, code forensics, Ed25519 authorship proofs, and 11-tier failover routing — ships in the core MIT codebase rather than behind an "Enterprise Open-Core" paywall.
- **Minimal Attribution**: Retain the copyright notice and license text (`LICENSE`) when redistributing substantial portions of the codebase.

---

## 2. MIT vs. Apache License 2.0 (Comparison for Contributors & Downstream Forks)

We evaluated both **MIT** and **Apache License 2.0** for Veritas:

| Dimension | MIT License *(Active in Veritas)* | Apache License 2.0 *(Alternative)* |
| :--- | :--- | :--- |
| **Simplicity & Readability** | ~170 words; universally pre-approved by nearly every enterprise legal team and academic institution. | Longer formal legal text requiring explicit notice propagation. |
| **Explicit Patent Grant** | Implicit; no explicit patent grant or patent-retaliation clause. | Includes an explicit patent license grant from contributors and patent-retaliation termination. |
| **`NOTICE` File Propagation** | Not required beyond preserving copyright + permission notice. | Downstream distributions must preserve `NOTICE` attribution files and document modified files. |
| **License Compatibility** | Compatible with GPLv2/v3, Apache 2.0, BSD, and proprietary licenses. | Compatible with GPLv3 (incompatible with GPLv2-only). |

**Guidance for Downstream Enterprise Forks:** If your organization redistributes a derivative product requiring explicit patent-grant protections across contributors, you may re-license your downstream modifications under **Apache 2.0** (retaining Veritas's MIT notice for upstream code).

---

## 3. Third-Party Dependencies

All runtime npm packages are open-source (predominantly MIT, ISC, Apache-2.0, and BSD-3-Clause). Run a license & vulnerability audit anytime with:

```bash
npm audit --audit-level=high
```
