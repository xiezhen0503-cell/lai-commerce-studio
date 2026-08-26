# REST / OpenAPI

机器可读合同位于 [`docs/openapi.yaml`](openapi.yaml)，运行时可从 `/api/openapi` 获取。基线为 OpenAPI 3.1.2；JSON Schema 方言与 OAS 3.1 一致。

所有 `/api/v1/tools/*` 外部工具调用使用 Bearer Token；面向工作台的人类接口在本地演示中使用单工作区会话，生产部署必须接入真实 Session/OIDC。错误统一返回 `{error:{code,message,details?,traceId}}`。创建、运行、回写和审核接口支持 `Idempotency-Key`。异步任务通过 `/jobs/{jobId}` 轮询或 `/events` SSE 订阅。

API 不提供“直接发布”端点。Artifact 导出只生成下载响应；任何接入平台发布的 Provider 都必须在独立确认流程后调用。

规范参考：[OpenAPI 3.1.2](https://spec.openapis.org/oas/v3.1.2.html)。
