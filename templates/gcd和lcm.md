```c++
#include<iostream>
using namespace std;

long long fun(long long a,long long b) {
    if(a % b != 0) {
        return fun(b, a % b);
    } else {
        return b;
    }
}

int main() {
    long long a,b;
    cin>>a>>b;
    cout << a / fun(a, b) * b; // 这里不要先乘，可能会超出long long的范围
}
```

两数的最小公倍数 = 两数相乘的积除以两数的最大公约数