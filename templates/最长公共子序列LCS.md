```c++
#include <bits/stdc++.h>
using namespace std;

/*
a[i]==b[j],方程：dp[i-1][j-1]+1
a[i]!=b[j],方程：max(dp[i][j-1],dp[i-1][j])
*/
const int N = 1010;//常量，表示数组大小 
int a[N],b[N],dp[N][N];
int n,i,j; 

int main() {
	cin>>n;
	for(i = 1;i <= n;i++) cin>>a[i];
	for(i = 1;i <= n;i++) cin>>b[i];
	
	//递推
	for(i = 1;i <= n;i++){
		for(j = 1;j <= n;j++){
			if(a[i] == b[j]) dp[i][j] = dp[i-1][j-1] + 1;
			else dp[i][j] = max(dp[i-1][j],dp[i][j-1]);
		}
	} 
	
	cout<<dp[n][n];
	return 0;
}
```

