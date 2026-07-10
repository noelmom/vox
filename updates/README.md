# Vox Sparkle updates

`appcast.xml` is the production Sparkle feed. It is intentionally an empty,
valid RSS feed until the first signed package release is ready.

Vox Helper reads the raw GitHub representation of this file, not the HTML
repository page:

```text
https://raw.githubusercontent.com/noelmom/vox/main/updates/appcast.xml
```

Release packages use immutable GitHub Release URLs such as:

```text
https://github.com/noelmom/vox/releases/download/v1.2.3/Vox-1.2.3.pkg
```

Do not edit this feed by hand. Generate and verify an appcast candidate, upload
and probe the package, then make the appcast change as the final update-host
mutation. The release finalizer requires a package-only probe, verifies the raw
GitHub feed, then tags or creates a GitHub release.
