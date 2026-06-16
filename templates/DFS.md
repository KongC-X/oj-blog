```c++
// 使用方向数组，循环递归访问四个方向!(也可以分为在探测前判断准备探测点的正确性以及不管点是否正确，直接递归，在递归进来的地方判断点是否正确两种写法)
// 定义数组，存储x和y的变化，第一个为0不用，后面四个分别代表右下左上
int fx[5] = {0,0,1,0,-1};
int fy[5] = {0,1,0,-1,0};
// 深度优先搜索
void dfs(int x,int y,int k) {
    a[x][y] = k;
    int tx,ty;
    // 通过循环方向值变化的数组，将x和y的变化逐个相加到x和y上
    for(int i = 1;i <= 4;i++) {
        tx = x + fx[i];
        ty = y + fy[i];
        if(tx >= 1 && tx <= n && ty >= 1 && ty <= m && a[tx][ty] == 0) {
            dfs(tx,ty,k+1);
        }
    }
}


int main(){
    cin >> n >> m;
    // 为1，1点赋值为1
    dfs(1,1,1);
    for(int i=1;i<=n;i++){
        for(int j=1;j<=m;j++){
            cout << setw(3) << a[i][j];
        }
        cout << endl;
    }
}
```



回溯

```c++
/*
思路：沿着右、下、左、上的顺序深度优先搜索，走过的点标记为true递归其他方向，递归结束，后退到上一步，撤销标记，回溯到前一个状态
*/
// 对应上述的实现思路二
#include <iostream>
using namespace std;
int n,c;
int r[30][3]; // 存储路径
bool f[10][10]; // 标记是否走过
// 右下左上
int fx[5] = {0,0,1,0,-1};
int fy[5] = {0,1,0,-1,0};
// 打印输出函数
void print(int k){
    c++;
    cout << c << ":";
    for(int i = 1; i < k; i++) {
        cout << r[i][1] << "," << r[i][2] << "->";
    }
    cout << n << "," << n << endl;
}
void dfs(int x,int y,int k) {
    r[k][1] = x;
    r[k][2] = y;
    // 如果到了终点就打印路径
    if(x == n && y == n) {
        print(k);
        return;
    } else {
        // 否则尝试不同的方向
        int tx,ty;
        for(int i = 1; i <= 4; i++) {
            tx = x + fx[i];
            ty = y + fy[i];
            // 如果新的方向可达，且没有访问过
            if(tx >= 1 && tx <= n && ty >= 1 && ty <= n && f[tx][ty] == false) {
                f[tx][ty] = true; // 标记为已访问
                dfs(tx,ty,k+1); // 递归搜索
                f[tx][ty] = false; // 回溯，撤销标记
            }
        }
    }
}
int main(){
    cin >> n;
    f[1][1] = true; // 标记起点已访问
    // 从1，1点开始递归搜索
    dfs(1,1,1);
    return 0;
}


// 对应上述的实现思路一
#include <iostream>
using namespace std;
int n,c;
int r[30][3]; // 存储路径
bool f[10][10]; // 标记是否走过
// 右下左上
int fx[5] = {0,0,1,0,-1};
int fy[5] = {0,1,0,-1,0};
// 打印输出函数
void print(int k){
    c++;
    cout << c << ":";
    for(int i = 1; i < k; i++) {
        cout << r[i][1] << "," << r[i][2] << "->";
    }
    cout << n << "," << n << endl;
}
void dfs(int k) {
    int tx,ty;
    for(int i = 1; i <= 4; i++) {
        tx = r[k-1][1] + fx[i];
        ty = r[k-1][2] + fy[i];
        // 如果新的方向可达，且没有访问过
        if(tx >= 1 && tx <= n && ty >= 1 && ty <= n && f[tx][ty] == false) {
            // 存储路径
            r[k][1] = tx;
            r[k][2] = ty;
            f[tx][ty] = true; // 标记为已访问
            if(tx == n && ty == n) {
                print(k); // 打印路径
            } else {
                dfs(k+1); // 递归搜索
            }
            f[tx][ty] = false; // 回溯，撤销标记
        }
    }
}
int main(){
    cin >> n;
    r[1][1] = 1;
    r[1][2] = 1;
    f[1][1] = true; // 标记起点已访问
    dfs(2); // 从r数组下标为2的那一行开始存路径
    return 0;
}
```



全排列

```c++
#include <iostream>
using namespace std;

int n;
int a[10]; // 存放全排列的结果
bool f[10]; // 标记是否使用过数字

// 打印输出函数
void print(){
    for(int i = 1;i <= n;i++) {
        cout << a[i];
        if(i != n) {
            cout << " ";
        } else {
            cout << endl;
        }
    }
}

// 递归函数为a数组每个元素赋值
void dfs(int k) {
    for(int i = 1;i <= n;i++) {
        // 如果i这个数没有被用过，则填写到下标为k的位置
        if(f[i] == false) {
            a[k] = i;
            f[i] = true;// 标记被选中了
            // 如果a中存储了n个元素，输出结果，否则递归为k+1的下标赋值
            if(k == n) {
                print();
            } else {
                dfs(k + 1);
            }
            f[i] = false; // 回溯到前一个状态
        }
    }
}

int main(){
    cin >> n;
    dfs(1);
}
```

