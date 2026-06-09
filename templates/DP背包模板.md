---
category: 算法
tags: [DP, 背包, 动态规划]
---

# DP 背包模板

## 01 背包
```cpp
// dp[j] = 容量为j时的最大价值
for (int i = 1; i <= n; i++) {
    for (int j = V; j >= v[i]; j--) {
        dp[j] = max(dp[j], dp[j - v[i]] + w[i]);
    }
}
```

## 完全背包
```cpp
for (int i = 1; i <= n; i++) {
    for (int j = v[i]; j <= V; j++) {
        dp[j] = max(dp[j], dp[j - v[i]] + w[i]);
    }
}
```
