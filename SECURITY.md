# Security policy

This policy covers LabTicker itself, not vulnerability monitoring for software in a user's homelab. No supported production release exists yet.

Do not post vulnerabilities, exploit details, credentials or subscriber information in public issues. Use [GitHub private vulnerability reporting](https://github.com/labticker/platform/security/advisories/new), enabled on this public repository. A non-owner reporting drill, backup security contact and response targets remain owner setup tasks. No reporting address is fabricated here.

For incidents, pause outbound sends and affected workers, preserve redacted evidence, revoke exposed credentials through an authorized operator, patch and test in staging, assess notification obligations, and release through protected CI. Do not copy production subscriber data to agent tools. Production analytics access is aggregate-only.
