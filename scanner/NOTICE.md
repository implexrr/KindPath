# Third-party seccomp profile

`seccomp.json` is derived from Microsoft Playwright v1.64.1:
https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json

The upstream project is licensed under Apache License 2.0; see LICENSE.playwright-seccomp. The local profile adds an unconditional chroot syscall allowance so Chromium can restrict its filesystem inside its own user namespace while the container retains no capabilities. All other upstream rules are preserved.
