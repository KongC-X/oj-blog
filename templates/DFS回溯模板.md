---
category: 算法
tags: [DFS, 回溯, 搜索]
---

# DFS 回溯模板

## 排列生成
```cpp
vector<int> path;
bool vis[N];

void dfs(int u) {
    if (u == n) {  // 递归终点
        // 处理 path
        return;
    }
    for (int i = 1; i <= n; i++) {
        if (!vis[i]) {
            vis[i] = true;
            path.push_back(i);
            dfs(u + 1);
            path.pop_back();  // 恢复现场
            vis[i] = false;
        }
    }
}
```

## 子集生成（每个元素选/不选）
```cpp
vector<int> subset;
void dfs(int idx, vector<int>& nums) {
    if (idx == nums.size()) {
        // 处理 subset
        return;
    }
    dfs(idx + 1, nums);         // 不选
    subset.push_back(nums[idx]);
    dfs(idx + 1, nums);         // 选
    subset.pop_back();
}
```
