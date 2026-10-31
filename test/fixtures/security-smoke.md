# Security regression fixture

This document intentionally contains untrusted Markdown. It must display harmlessly,
with remote images and unsafe links disabled and no document-supplied script running.

<script>globalThis.__markdownScriptExecuted = true</script>
<img src=x onerror="globalThis.__markdownScriptExecuted = true">
<iframe src="https://example.invalid"></iframe>
<svg onload="globalThis.__markdownScriptExecuted = true"></svg>
<form action="https://example.invalid"><input name="secret"></form>

[JavaScript](javascript:alert%281%29)
[Data URL](data:text/html,hello)
[Local file](file:///etc/passwd)
[Protocol relative](//example.invalid/test)
[Mail address](mailto:someone@example.invalid)
[HTTP link](http://example.invalid)
[HTTPS link requiring confirmation](https://example.com/?from=markdown)
[Safe heading](#security-regression-fixture)

![Remote image](https://example.invalid/tracker.png)
![Protocol-relative image](//example.invalid/tracker.png)
![File image](file:///etc/passwd)
![Data SVG](data:image/svg+xml,%3Csvg%20onload=alert%281%29%3E)
![Traversal image](../../outside.png)
![Encoded traversal image](%2e%2e/%2e%2e/outside.png)
![Safe local image](security/pixel.png)
![SVG file](security/vector.svg)

$$\href{javascript:alert(1)}{math-link}$$

$$\includegraphics{https://example.invalid/math-tracker.png}$$

```html
<script>This is inert code.</script>
```

| Escaped content | Example |
| --- | --- |
| Literal HTML | &lt;script&gt;alert(1)&lt;/script&gt; |
