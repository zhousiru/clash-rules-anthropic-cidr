# clash-rules-anthropic-cidr

用于匹配 Anthropic 服务 IP 的 Clash RULE-SET

每日从 [Anthropic 官方文档](https://platform.claude.com/docs/en/api/ip-addresses) 生成，只包含 Inbound（客户端连接的目标地址）网段。

## 使用

### Rule Providers

- **jsDelivr** (Recommend)

  [https://cdn.jsdelivr.net/gh/Zhousiru/clash-rules-anthropic-cidr@dist/anthropic-cidr.yml](https://cdn.jsdelivr.net/gh/Zhousiru/clash-rules-anthropic-cidr@dist/anthropic-cidr.yml)

- **GitHub**

  [https://raw.githubusercontent.com/Zhousiru/clash-rules-anthropic-cidr/refs/heads/dist/anthropic-cidr.yml](https://raw.githubusercontent.com/Zhousiru/clash-rules-anthropic-cidr/refs/heads/dist/anthropic-cidr.yml)

### 示例配置

```yml
rule-providers:
  anthropic-cidr:
    type: http
    behavior: ipcidr
    url: https://cdn.jsdelivr.net/gh/Zhousiru/clash-rules-anthropic-cidr@dist/anthropic-cidr.yml
    path: ./ruleset/anthropic-cidr.yml
    interval: 86400

rules:
  - RULE-SET,anthropic-cidr,PROXY,no-resolve
```

`no-resolve` 下只匹配直接连 IP 的请求，域名请求请另配域名规则。

## 数据源

文档地址记录在 `source.json`。该地址失效或解析失败时，脚本会从 [llms.txt](https://platform.claude.com/llms.txt) 查找新地址，校验通过后由 Action 提交回 `source.json`。

生成失败时 Action 会调用 Codex 修复，重新生成成功后直接提交到 `main` 并发布，需要配置 `OPENAI_API_KEY` Secret。修复后仍失败时 Action 报错，`dist` 分支保持上一份规则不变。
