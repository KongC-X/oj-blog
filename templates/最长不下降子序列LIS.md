```c++
#include <iostream>
#include <bits/stdc++.h>
using namespace std;

int a[10010],n,i,j;
int dp[10010];
int ma,s;

int main() {
    cin >> n;
    for(i = 1;i <= n;i++) {
        cin >> a[i];
    }

    // 状态转移方程：
    // dp[i] = max(dp[j] + 1, dp[i])
    // 其中 0 <= j < i 且 a[j] < a[i]
    // 求以每个数结尾的最长上升子序列的长度
    for(i = 1;i <= n;i++) {
        dp[i] = 1;
        // 将a[i]尝试续到每个数后面，看dp[i]能否增加
        for(j = 1;j < i;j++) {
            if(a[j] < a[i]) {
                dp[i] = max(dp[j] + 1, dp[i]);
            }
        }
        ma = max(ma, dp[i]);
    }

    cout << ma << endl;
}

```

