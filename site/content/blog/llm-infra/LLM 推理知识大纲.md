---
title: LLM 推理知识大纲
published: 2026-04-20T09:05:08.527Z
description: ''
updated: ''
tags:
  - LLM-Infra
category: LLM 推理优化
draft: false
pin: 99
toc: true
lang: ''
abbrlink: llm-infra
date: 2026-04-20T09:05:08.527Z
lastmod: 2026-04-20T09:05:08.527Z
author: Languisher
categories:
  - ai-infra
show_toc: true
weight: -99
url: /posts/llm-infra/
aliases:
  - /en/posts/llm-infra/
math: true
migrated: true
disable_math: true
disable_highlight: true
---
> [LLM 推理基础术语解释](/posts/inference-terms-basic/)

## 基础知识

- 通信基础：[集合通信操作和其实现](/posts/collective-communication/)
- LLM 基础：
	- [LLM 基础：Attention](/posts/llm-basic-1/)
	- [LLM 基础：Transformers](/posts/transformers/)
## 分布式并行策略

> [大模型推理并行策略](/posts/parallelize-method/)

- Data Parallellism (DP).
	- DDP
	- [ZeRO 和 FSDP：DP优化——将模型参数和中间状态分片到多卡](/posts/zero/)
- Tensor Parallelism (TP).
	- [TP 实现](/posts/parallelize-method/#tp-%E5%AE%9E%E7%8E%B0)
- Pipeline Parallelism (PP).
	- [Pipeline Parallel：模型并行](/posts/pipeline-parallel/)
- Sequence Parallelism (SP) & Context Parallelism (CP)
	- [DeepSpeed Ulysses：Attention Block 的序列并行](/posts/deepspeed-ulysses/)
	- [Ring Attention：Attention Block 的序列并行](/posts/ring-attention/)
	- USP
- Expert Parallelism (EP)
	- [EPLB：MoE Expert 负载均衡](/posts/eplb/)
- 组合并行.

## Attention 优化

- FlashAttention v1/v2/v3/v4
	- [Online Softmax 推导](/posts/online-softmax/)
	- [Flash Attention (FA1)](/posts/flash-attention-v1/)
	- [Flash Attention 2 (FA2)](/posts/flash-attention-v2/)
- [Flash Decoding](/posts/flash-decoding/)
- Sparse / Sliding Window / Linear Attention

## KV Cache 管理

- [Paged Attention：高效管理 KV Cache](/posts/paged-attention/)
- [Prefix Cache：前缀 KV Cache 缓存](/posts/llm-infra-prefix-cache/)
- Cache eviction / reuse
- Hybrid KV Cache Manager
- KV transfer

## 调度优化

- Static batching
- [Continuous Batching](/posts/continuous-batching/)
- [Chunked Prefill](/posts/chunked-prefill/)
- Prefill-Decode 协同调度
- 长短请求混部
- Admission control / priority

## Kernel 优化

- [CUDA Graph：合并多个算子](/posts/cuda-graph/)

## Serving 架构

- Offline vs Online inference
- 单实例 / 多实例
- Router / Scheduler / Worker
- PD 分离
- Disaggregated Prefill
- Multi-model / Multi-LoRA serving

## MoE 系统优化

- Router
- Top-k gating
- Expert Parallelism
- all-to-all cost
- grouped GEMM / fused MoE kernels
- load balance / expert placement / replication

## 模型压缩与部署成本优化

- Quantization
- KV cache quantization
- Distillation
- LoRA / Multi-LoRA serving

## 通信与系统基础

- [集合通信操作和其实现](/posts/collective-communication/)
- 通信-计算 overlap
- 带宽模型与性能分析
