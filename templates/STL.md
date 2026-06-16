STL 简介： STL(Standard Template Library) 标准模板库，是“容器”的集合。

STL 中常见的集合有：向量 (vector)、 栈 (stack)、 队 列 (queue)、 优先队列 (priority queue)、 链表 (list)、 集合 (set)、 映射 (map) 等容器。

C++标准模板库的核心包括以下三个组件：

|       组件        |                             描述                             |
| :---------------: | :----------------------------------------------------------: |
| 容器(Containers)  | 容器是用来管理某一类对象的集合。C++提供了各种不同类型的容器，比如deque、list、vector、map等。 |
| 算法(Algorithms)  | 算法作用于容器。它们提供了执行各种操作的方式，包括对容器 内容执行初始化、排序、搜索和转换等操作。 |
| 迭代器(iterators) | 迭代器用于遍历对象集合的元素。这些集合可能是容器，也可能 是容器的子集。 |

**STL内的所有组件都由模板(template)构成，其元素可以是任意类型。**



## **向量 vector**

向量 (vector) 是一个顺序容器 (Sequence Container), 它能够存放各种类型的对象。

可以简单的认为， **向量是一个能够存放任意类型的动态数组(元素个数可变)。**

**vector的常见函数**

|                    函数名                    |                           函数说明                           |
| :------------------------------------------: | :----------------------------------------------------------: |
|               push back(元素)                |                    增加一个元素到向量后面                    |
|              insert(位置，元素)              |                   插入元素到向量的指定位置                   |
|          insert(位置，个数n,  元素)          |                 插入n个相同的元素到指定位置                  |
| insert(位置，向量头指针 first,向量尾指针end) | 将另一个向量从first位置开始到end结束(不包括end)之间的内容 插入该向量的指定位置。 |
|                 erase(位置)                  |                      删除指定位置的元素                      |
|          erase(开始位置，结束位置 )          |                 删除向量中(first,last)中元素                 |
|                  pop back()                  |                 弹出(删除)向量的最后一个元素                 |
|                   clear()                    |                清除向量所有元素，size()变为0                 |
|                  运算符[i]                   |                     取向量下标为i的元素                      |
|                   front()                    |                       取向量第一个元素                       |
|                    back()                    |                      取向量最后一个元素                      |
|                   begin()                    |            返回向量头指针(迭代器),指向第一个元素             |
|                    end()                     |       返回向量尾指针，指向向量最后一个元素的下一个位置       |
|                   rbegin()                   |                 反向迭代器，指向最后一个元素                 |
|                    rend()                    |             反向迭代器，指向第一个元素之前的位置             |
|                    size()                    |                  返回向量中实际元素的个数。                  |
|                 resize(大小)                 |        重新设定向量的大小，也就是可以保存元素的个数。        |
|                  max size()                  |                  得到vector最大可以是多大。                  |
|                   empty()                    |             判断向量是否为空，等价于size()为0。              |
|                    swap()                    |                  交换两个同类型向量的数据。                  |

**对应于数组，要注意：向量的大小是可变的，开始时向量为空，随着不断插入元素，向量自动申请空间，容量变大。注意学会使用： sort()、reverse()等函数对vector进行排序、逆序等操作。**



### vector的存储和遍历

注意掌握 vector构造的4个常见方法：

(1) vector():创建一个空 vector

(2) vector(n):创建一个元素个数为 n 的 vector

(3) vector(n,t):创建一个元素个数为 n 且值为 t 的 vector

(4) vector(begin,end):复制(begin,end)区间内另一个数组的元素到 vector中

```c++
#include <bits/stdc++.h>
using namespace std;

void print(vector<int> v){
	//遍历 vector 中的元素
	for(int i = 0;i < v.size();i++){
		//vector: 可以使用下标访问，但不能越界
		cout<<v[i]<<" ";
	}
}

int main(){
	// 定义方法一：定义 vector 存储 int 类型的变量
	// vector<int> v;
	// size(): 获取 vector 存储元素的个数
	// cout<<v.size()<<endl;
	// 注意：常见错误，vector<int> v 定义一个空 vector, 不可以用下标θ和1来访问元素
	// v[0]= 10;
	// v[1]= 20;
	// v.push_back(10);
	// v.push_back(20);
	// v.push_back(30);
	// cout<<v.size()<<endl;
	// print(v);
    
	// 定义方法二：定义一个长度为5的 vector, 默认值为0
	// vector<int> v(5);
    
	// 定义方法三：定义长度为5的 vector, 默认值为80
	// vector<int> v(5,80);
    
	int a[] = {10,20,30,40,50};
	// 定义方法四：使用数组初始化 vector
	// sizeof(): 计算变量占用的字节数
	// sizeof(a)/sizeof(int):  计算数组的实际长度
	// cout<<sizeof(a)/sizeof(int)<<endl;
	vector<int> v(a,a+sizeof(a)/sizeof(int));
	v.push_back(10);
	print(v);
	return 0;
}
```





### vector 插入删除、获取头尾元素

```c++
#include <bits/stdc++.h>
using namespace std;

void print(vector<int> v){
	//遍历 vector 中的元素
	for(int i = 0;i < v.size();i++){
		//vector: 可以使用下标访问，但不能越界
		cout<<v[i]<<" ";
	}
}

int main(){
	vector<int> v;
    v.push_back(10);
    v.push_back(20);
    v.push_back(30);
    
    // 获取头尾元素
    cout<<" 第一个元素："<<v.front()<<" "<<*v.begin()<<endl;
    cout<<" 最后一个元素："<<v.back()<<endl;
    print(v);
    
    // insert(位置，元素): 位置必须提供位置指针
    // 向 vector 中下标为1的位置插入元素100
    // v.insert(v.begin()+1,100);
    // print(v);
    
    // 向 vector  中 下 标 为 1 的 位 置 插 入 5 个 1 0 0
    // v.insert(v.begin()+1,5,100);
    // print(v);
    
    //   vector<int> v2;
    //   v2.push_back(100);
    //   v2.push_back(200);
    //   v2.push_back(300);
    //   向 vector 下标为1的位置插入 v2 中下标为1到最后的所有元素
    //   v.insert(v.begin()+1,v2.begin()+1,v2.end());
    //   print(v);
    
    // 删除 vector  中 下 标 为 1 的 元 素
    // v.erase(v.begin() + 1);
    
    // 从向量中下标为1的元素开始删除到最后
    v.erase(v.begin()+1,v.end());
    print(v);
    return 0;
}
```





### resize、swap、sort、reverse函数

```c++
#include <bits/stdc++.h>
using namespace std;

void print(vector<int> v){
	//遍历 vector 中的元素
	for(int i = 0;i < v.size();i++){
		//vector: 可以使用下标访问，但不能越界
		cout<<v[i]<<" ";
	}
}

int main(){
	// vector<int> v1;
	// v1.push_back(10);
	// v1.push_back(20);
    
	// vector<int> v2;
	// v2.push_back(100);
    // v2.push_back(300);
    
    //  swap(v1,v2)
    //  cout<<"v1:";
    //  print(v1);
    //  cout<<"v2:";
    //  print(v2);
    
    int a[]={5,3,1,4,2};
    vector<int> v(a,a+5);
    sort(v.begin(),v.end());
    print(v);
    
    reverse(v.begin(),v.end());
    print(v);
    
    //重置 vector的大小为20,后面补0
    v.resize(20);
    return 0;
}
```



### 二维vector

**最外的<>要有空格，否则在比较旧的编译器下无法通过**

```c++
#include <bits/stdc++.h>
#include <iostream>
using namespace std;

int main(){
	vector<vector<int> > v(20);
	for(int i=0;i<5;i++){
	    for(int j=0;j<5;j++){
	        v[i].push_back(i+j); // 注意输入，每行都是一个vector
	    }
	}
	for(int i=0;i<5;i++){
	    for(int j=0;j<5;j++){
	        cout << v[i][j] << " "; // 输出和二维数组一样
	    }
	    cout << endl;
	}
}
```





## 迭代器

### 利用迭代器迭代vector的元素

```c++
#include <bits/stdc++.h>
#include <iostream>
using namespace std;

int main(){
	//  char s[]="hello stl";
    //  char *p;//&s &s[θ]
    //  p 是一个指向字符数组的指针，相当于一个迭代器
    //  for(p=s;*p!='\0';*p++){
    //  	p 是指针，指向数组的不同位置，*p 是元素
    // 		cout<<*p<<"";
    //  }
    
    int a[]={10,20,30,40,50};
    vector<int> v(a,a+5);
    
    //定义迭代器，命名为 it
    vector<int>::iterator it;
    
    //迭代器指向 vector<int> 的首元素
    it = v.begin();
    (*it)++;
    cout<<*it<<" "<<v[0]<<endl;
    
    //利用迭代器循环遍历 vector
    cout<<"迭代器遍历 vector:";
    for(it = v.begin();it < v.end();it = it + 2){
    	cout<<*it<<" ";
    }
    cout<<endl;
    
    //利用迭代器反向遍历 vector
    cout<<"反向迭代器遍历：";
    vector<int>::reverse_iterator rit;
    for(rit = v.rbegin();rit != v.rend();rit++){
    	cout<<*rit<<" ";
    }
    cout<<endl;
    return 0;
}
```



### 迭代器分类

常用的迭代器按功能强弱分为： 输入、输出、正向、双向、随机访问五种，这里只介绍常用的三种。

不同容器的迭代器，其功能强弱有所不同。

例如，排序算法需要通过随机访问迭代器来访问容器中的元素，因此有的容器就不支持排序算法。

A、 正向迭代器。

​		√ 假 设 p 是一个正向迭代器，则 p 支持以下操作：++p,p++,*p。

​		√ 此外，两个正向迭代器可以互相赋值，还可以用=和!=运算符进行比较。

B、 双向迭代器。

​		√ 双向迭代器具有正向迭代器的全部功能。

​		√ 双向迭代器p 支持-p 和 p--, 使得 p 朝和++p 相反的方向移动。 

C、 随机访问迭代器。

​		√ 随机访问迭代器具有双向迭代器的全部功能。

​		√ 随机访问迭代器p 还支持以下操作：

​				\> p+=i: 使得 p 往后移动 i 个元素。

​				> p-=i: 使得 p 往前移动 i 个元素。

​				\> p+i: 返 回 p 后面第 i 个元素的迭代器。

​				> p-i: 返 回 p 前面第 i 个元素的迭代器。

​				> p[i]: 返回 p 后面第 i 个元素的引用。

​				\> 两个随机访问迭代器 p1、p2 还可以用<、>、<=、>=运算符进行比较。

 				p1 < p2 的含义是： p1 经过若干次(至少一次)++操作后，就会等于 p2。

​				表达式p2 - p1 表示迭代器 p2 所指向元素和迭代器 p1 所指向元素的序号差 (p2 和 p1 之间的元素个数减一)



### 不同容器支持的迭代器

|            容器            |  迭代器类别  |
| :------------------------: | :----------: |
|       vector（向量）       |     随机     |
|     deque（双向队列）      |     随机     |
|        list（列表）        |     双向     |
|    set/multiset（集合）    |     双向     |
|    map/multimap（映射）    |     双向     |
|        stack（栈）         | 不支持迭代器 |
|       queue（队列）        | 不支持迭代器 |
| priority queue（优先队列） | 不支持迭代器 |

 

## 双向队列 deque

deque 也是顺序容器的一种，也是一个可变长数组。

要使用 deque, 需要包含头文件 deque。

所有适用于vector的操作都适用于deque, deque在**头尾增删元素性能较好**。

deque 的特点：

​	√  deque 和 vector 有很多类似的地方。在 deque 中，随机存取任何元素都能在常数时间内完成(但慢于vector)。

​	√ 它相比于 vector 的优点是， vector  在头部删除或添加元素的速度很慢，在尾部添加元素的性能较好， **而deque在头尾增删元素都具有较好的性能(大多数情况下都能在常数时间内完成)。**            

deque 有两种 vector 没有的成员函数：

​	√  `void  push_front(const  T&  val);  //将 val 插入容器的头部 `

​	√  `void pop_front(); // 删除容器头部的元素`

deque 使用注意：

​	√  deque 支持随机存取

​	√ deque 支持在头部和尾部存储数据

​	√ deque 不支持 capacity 和 reserve 操作

```c++
#include <iostream>
#include <bits/stdc++.h>
using namespace std;

// 打印队列
void print(deque<int> d) {
	for(int i = 0;i < d.size();i++) {
		cout << d[i] << " ";
	}
	cout << endl;
}

int main() {
	// deque<int> d(5,100); // 定义一个包含5个元素，每个元素值为100的双端队列
	int a[] = {10,20,30};
	deque<int> d(a,a+3);
	print(d);

	// 在双端队列的头部添加元素
	d.push_front(5);
	print(d);

	// 在双端队列的尾部添加元素
	d.push_back(40);
	print(d);

	// 在双端队列的头部删除元素
	d.pop_front();
	print(d);

	// 在双端队列的尾部删除元素
	d.pop_back();
	print(d);
}
```



## 链表list

### 什么是list

顺序存储结构的优缺点分析

优点：

A、无需为表示结点间的逻辑关系而增加额外的存储空间；

B、可方便地随机存取表中的任一元素。

缺点：

A、插入或删除平均需要移动一半的结点；

B、顺序表要求占用连续的存储空间。

比如数组：定义时需要确定数组大小，可能造成空间不足或者浪费的问题。

list 是一个线性双向链表结构，它的数据由若干个节点构成，每一个节点都包括一个信息块(即实际存储的数据)、 一个前驱指针和一个后驱指针。它无需分配指定的内存大小且可以任意伸缩，这是因为它存储在非连续的内存空间中，并且由指针将有序的元素链接起来。

特点：

​	√  list 随机检索的性能非常不好，因为它不像vector那样直接找到元素的地址，而是要从头一个一个的顺序查找。

​	√  但是它可以迅速地在任何节点进行插入和删除操作， 因 为 list 的每个节点保存着它在链表中的位置，插入或删除一个元素仅对最多三个元素有所影响。

​	√  list 支持双向迭代器，没有下标，必须使用迭代器遍历list 。 ( 由于不支持随机迭代器，不能写迭代器 + x, 迭代器 - x, 不能用 sort( ) 函 数 ， 但list 拥有 sort 成员函数 )

注意：推荐引入 `#include  <list> `  头文件



### list 相关函数

|           函数名            |           函数说明           |
| :-------------------------: | :--------------------------: |
|       push_back(元素)       |      往链表尾部添加元素      |
|      push_front(元素)       |      往链表头部添加元素      |
|       pop_back(元素)        |       链表尾部移除元素       |
|       pop_front(元素)       |       链表头部移除元素       |
|          insert()           | 在指定位置插入一个或多个元素 |
|           begin()           |      获取链表的起始地址      |
|            end()            |      获取链表的结束地址      |
|           size()            |       返回链表元素个数       |
|         max size()          |    获取链表支持的最大容量    |
|  erase(开始地址，结束地址)  | 删除链表中指定范围之间的元素 |
|        remove(值val)        |     删除和val相等的元素      |
|           clear()           |           清空链表           |
|           empty()           |       判断链表是否为空       |
| reverse(开始地址，结束地址) |        翻转链表所有值        |
|       sort(链表对象)        |         链表元素排序         |

STL 中的算法 sort 可以用来对 vector 和 deque 排序，它需要随机访问迭代器的支持。 

因为 list 不支持随机访问迭代器，所以不能用算法 sort 对 list 容器排序。

因此， list 容器引入了sort 成员函数以完成排序。



### list的应用

```c++
#include<bits/stdc++.h>
#include<iostream>
#include<list> // 引入list头文件
using namespace std;

void print(list<int> l) {
	list<int>::iterator it;
	// 注意，这里不可以用it < l.end()，因为list用的是双向迭代器，不支持<运算符
	for (it = l.begin(); it != l.end(); it++) {
		cout << *it << " ";
	}
	cout << endl;
}

int main() {
	// list<int> l(5);
	int a[] = {10, 20, 30, 40, 50};
	list<int> l(a, a + 5); // 使用数组初始化list
	print(l);

	l.insert(l.begin(), 5); // 在开头插入一个元素5
	print(l);

	list<int>::iterator it = l.begin();
	int x,y;
	cout << "请输入要插入的位置x和元素y: ";
	cin >> x >> y; // 在指定位置插入一个元素
	// l.insert(it + x, y);// 不能直接使用it + x，因为list不支持随机访问
	for(int i = 1; i < x; i++) {
		it++;
	}
	l.insert(it, y); // 在指定位置插入元素y
	print(l);

	// remove(): 删除所有值为x的元素
	l.remove(30); // 删除所有值为30的元素
	print(l);

	// 利用成员函数sort()对list进行排序
	l.sort();
	print(l);
} 

```



## 集合set

### 什么是set

set 是关联容器的一种，是**排序好的集合**(元素已经进行了排序),  set  中**不能有重复的元素**。 

注意：

​	√ **不能直接修改 set  容器中元素的值**。因为元素被修改后，容器并不会自动重新调整顺序， 于是容器的有序性就会被破坏，再在其上进行查找等操作就会得到错误的结果。因此，**如果要修改 set  容器中某个元素的值， 正确的做法是先删除该元素，再插入新元素**。

​	√ multiset 容器就像 set 容器，但它可以保存重复的元素。

​	√ set支持**双向迭代器**(不支持随机迭代器),在插入和删除时，要特别注意。

​	√ 在STL 中使用结构体， **需要对特定要求的运算符进行重载**；STL 默认使用小于号来排序， 因此，默认重载小于号； (如果使用greater<T>  比较器就需重载大于号),且要注意**让比较函数对相同元素返回 false**。

 

### set相关函数

|           函数名           |                       函数说明                       |
| :------------------------: | :--------------------------------------------------: |
|          begin( )          |                获取set容器的起始地址                 |
|           end( )           |                获取set容器的结束地址                 |
|         insert( )          |                     插入set容器                      |
| erase(开始地址，结束地址 ) | 删除set容器中指定范围之间的元素，set也支持直接删除值 |
|          find( )           |    查找匹配的元素迭代器，若不存在，返回set.end()     |
|          clear( )          |                     清空set容器                      |
|          size( )           |                 返回set容器元素个数                  |
|          empty( )          |                 判断set容器是否为空                  |

`注意：使用set请引入<set>头文件，如果要引入greater<T>和less<T>比较器，请引入<functional> 头文件。`



### set的基本使用

```c++
#include<bits/stdc++.h>
#include<iostream>
#include<set> 
using namespace std;

int main() {
	// 定义长度为0的set
	// set<int> s;
	int a[] = {10, 30, 20, 20, 50, 40};
	set<int> s(a, a + 6); // 使用数组初始化set

	// 插入元素
	// 插入到特定位置意义不大，因为插入结束后，set会自动排序
	// s.insert(s.begin(),60); // 插入60到set的开头
	s.insert(60);

	// 删除元素
	s.erase(s.begin()); // 删除set的第一个元素
	s.erase(30); // 删除值为30的元素

	set<int>::iterator it;

	// find查找元素,返回迭代器，如果没找到，返回s.end()
	it = s.find(20);
	if (it != s.end()) {
		cout << "20 存在于set中" << endl;
	} else {
		cout << "20 不存在于set中" << endl;
	}

	// 遍历set的元素
	for (it = s.begin(); it != s.end(); it++) {
		cout << *it << " ";
	}
	cout << endl;

} 

```



### `less<T> `和 `greater<T>` 比较器

```c++
#include<bits/stdc++.h>
#include<iostream>
#include<set> 
using namespace std;

int main() {
	// 定义长度为0的set
	// set<int> s;
	int a[] = {10, 30, 20, 20, 50, 40};
	// 默认比较器为less<int>，即升序
	// set<int, less<int> > s(a, a + 6); // 使用数组初始化set

	// 可以使用greater<int>比较器来降序
	set<int, greater<int> > s(a, a + 6);

	set<int>::iterator it;
	// 遍历set的元素
	for (it = s.begin(); it != s.end(); it++) {
		cout << *it << " ";
	}
	cout << endl;
} 

```

```c++
#include<bits/stdc++.h>
#include<iostream>
using namespace std;

int main() {
	int a[] = {2,1,3,5,4};
	sort(a, a + 5); // 默认从小到大排序
	// sort(a,a + 5, less<int>()); 
	// 使用less<int>()可以明确指定使用小于比较器进行排序
	sort(a,a + 5, greater<int>());
	// 使用greater<int>()可以明确指定使用大于比较器进行排序
	// 可以不用cmp函数，直接使用less<int>()或greater<int>()进行排序
	for(int i = 0; i < 5; i++) {
		cout << a[i] << " ";
	}
	cout << endl;
} 

```



### set存放结构体

注意：

(1) 当在 STL 应用使用结构体，需要对特定要求的运算符进行重载； STL 中的排序都是默认使用小于号来排序。

因此，在对结构体排序时，我们就需要重载小于号!

(2) 如果要使用 `greater<Student>` 比较器，就要对大于比较运算符进行重载。

(3) 要注意：让比较函数对相同元素返回 false。

```c++
#include<bits/stdc++.h>
#include<iostream>
#include<set> 
using namespace std;

struct Student {
	int num;
	string name;
	int score;

	// 重载大于运算符
	bool operator>(const Student& s) const {
	    // 按照成绩从高到低排序，如果成绩相同，则按学号从高到低排序
		if(score > s.score || (score == s.score && num > s.num)) {
			return true;
		} else {
			return false;
		}
	}
};

int main() {
	// 1. 定义一个set容器，存储Student结构体对象
	// set<Student> s;
	// set<Student, less<Student>> s;
	set<Student, greater<Student> > s;

	// 2. 向set容器中插入数据
	Student s1 = { 1, "zhangsan", 90 };
	Student s2 = { 2, "lisi", 85 };
	Student s3 = { 3, "wangwu", 95 };
	Student s4 = { 4, "zhaoliu", 85 };
	s.insert(s1);
	s.insert(s2);
	s.insert(s3);
	s.insert(s4);

	// 3. 遍历set容器，输出数据
	set<Student>::iterator it;
	for (it = s.begin(); it != s.end(); it++) {
		cout << "学号：" << it->num << "，姓名：" << it->name << "，成绩：" << it->score << endl;
	}
} 

```



## 映射map

### 什么是pair

pair 是将2个数据组合成一组数据，当需要这样的需求时就可以使用 pair

pair 的实现是一个结构体， 主要的两个成员变量是 first 和 second

pair的构建和使用：

1、初始化

`pair<T1,  T2>  p1;       //创建一个空的 pair 对象(使用默认构造)`

`pair<T1,T2>p1(v1,v2);//   创建一个 pair 对象，使用值v1 和 v2 初始化。`

`make pair(v1,v2);   // 以 v1 和 v2 的值创建一个新的pair 对象`

2、比较

`p1 < p2;    // 两个pair 对象间的小于运算，其定义遵循字典次序比较 first 和 second`

`p1 == p2;  // 如果两个对象的 first 和 second 依次相等，则这两个对象相等；`

3、访问成员变量

`p1.first;  // 返回对象p1 中名为first 的公有数据成员`

`pl.second;  // 返回对象 p1 中名为 second 的公有数据成员`



### pair的创建和使用

```c++
#include <iostream>
#include <bits/stdc++.h>
#include <map>
using namespace std;

int main() {
	// 定义pair
	// 1. pair:存储同学的学号和姓名
	// pair<int,string> p;
	// p.first = 1;
	// p.second = "zhang";

	// 2.定义pair同时初始化
	// pair<int,string> p(2,"li");

	// 3.使用make_pair函数
	// pair<int,string> p = make_pair(3,"wang");

	//4.为pair<>定义别名
	// typedef pair<int,string> Stu;
	// Stu s(4,"zhao");
	// Stu p;
	// p.first = 5;
	// p.second = "qian";
	// cout << p.first << " " << p.second << endl;

	// typedef:为类型定义别名
	// typedef long long ll;
	// ll a = 1000000000;
	// cout << a << endl;

	pair<int, string> p1(1, "zhang");
	pair<int, string> p2(2, "li");
	// 5.使用pair的比较运算符,比较pair对应的字典码
	if (p1 < p2) {
		cout << "p1 is less than p2" << endl;
	} else if (p1 > p2) {	
		cout << "p1 is greater than p2" << endl;
	} else {
		cout << "p1 is equal to p2" << endl;
	}
}
```





### 什么是map

map: 是关联容器的一种， **map 的每个元素都分为关键字和值两部分，容器中的元素是按关键字排序的， 并且不允许有多个元素的关键字相同** (multimap 允许存储相同键的元素)。

第一个称为关键字(key), 每个关键字只能在map 中出现一次，第二个称为该关键字的值(value);

例如：map <string,int>a; 可以将字符串映射为整数， 

注意：不能直接修改 map 容器中的关键字。 

因为map中的元素是按照关键字排序的， 当关键字被修改后，

容器并不会自动重新调整顺序，于是容器的有序性就会被破坏，

再在其上进行查找等操作就会得到错误的结果。



### map常见函数

|        函数名        |                           函数说明                           |
| :------------------: | :----------------------------------------------------------: |
|     find(关键字)     |  返回指定关键字元素的位置迭代器，如果不存在返回map.end()。   |
|    count(关键字)     | 统计指定关键字元素的个数，由于map每个元素的关键字都不相 同，count结果只能是1或者0。 |
|     insert(元素)     |       插入元素到map中，元素一般是make pair(关键字，值)       |
| erase(关键字/迭代器) |             删除map指定位置或者指定关键字的元素              |
|       clear()        |                  清除map所有元素，size()变0                  |
|       运算符[]       |      取/赋值map的指定关键字的对应值，类似数组的下标运算      |
|       begin()        | map的第一个元素(最小)元素的位置，返回第一个元素迭代器(指针 ) |
|        end()         | map的结束位置。注意：返回的迭代器是最后一个元素的后面位 置，不是最后一个元素的迭代器。 |
|        size()        |       元素个数，map的大小，也就是map中已有元素的个数。       |
|       empty()        |            判断map是否为空，等价于size()是否为0。            |



### map的使用

```c++
#include <iostream>
#include <bits/stdc++.h>
#include <map>
using namespace std;

int main() {
	// 1.定义一个map，默认根据key的升序排列
	map<int, string> m;
	// map<int,string, greater<int>> m; // 如果需要降序排列，可以使用greater<int>

	// 为map添加元素
	m[1] = "one";
	m[2] = "two";
	m[3] = "three";
	m[4] = "four";
	m[2] = "xxx";

	// 2.获取键（关键字key）为1000的值
	cout << m[1] << endl; // 输出 "one"
	cout << m[1000] << endl; // 输出 ""（空字符串），因为1000不存在于map中

	// 3.创建pair添加元素
	// 注意：如果使用pair添加元素，出现同样的key，则不会覆盖原有值
	pair<int, string> p(5, "five");
	pair<int, string> p2(5, "six");
	m.insert(p); // 使用insert方法添加pair
	m.insert(p2); // 如果key已存在，则不会覆盖原有值

	// 4.erase方法删除元素
	m.erase(2); // 删除key为2的元素
	m.erase(m.begin()); // 删除第一个元素
	// map支持双向迭代器，因此不能使用迭代器+x的方式删除元素

	map<int, string>::iterator it;

	// 5.查找元素
	it = m.find(3); // 查找key为3的元素
	// 还可以用m.count(3)来判断key是否存在
	if (it != m.end()) {
		cout << "Found: " << it->first << " : " << it->second << endl;
	} else {
		cout << "Not found" << endl;
	}

	// 6.遍历map
	for (it = m.begin(); it != m.end(); ++it) {
		cout << it->first << " : " << it->second << endl;
	}
    
    // map的常用函数
    // map.size() // 返回map中元素的个数
    // map.empty() // 返回map是否为空
    // map.clear() // 清空map
    // map.begin() // 返回指向map第一个元素的迭代器
    // map.end() // 返回指向map最后一个元素的迭代器
    // map.insert(pair) // 向map中插入元素，使用pair类型
    // map.erase(key) // 删除键为key的元素
    // map.find(key) // 查找键为key的元素，返回一个迭代器,如果找不到，则返回m.end()
    // map.count(key) // 返回键为key的元素个数，map中键是唯一的，因此返回值只能是0或1
}
```



## 栈stack

### 什么是容器适配器

STL 中的容器适配器有 stack、queue、priority queue 三种。

它们都是在顺序容器的基础上实现的，屏蔽了顺序容器的一部分功能，突出或增加了另外一些功能。

容器适配器都有以下三个成员函数：

push( ): 添加一个元素。

top( ): 返回顶部(对 stack 而言)或队头(对 queue、priority queue 而言)的元素的引用。

pop( ): 删除一个元素。

容器适配器是没有迭代器的，因此 STL中的各种排序、查找、变序等算法都不适用于容器适配器。



### 什么是栈

栈是一种**后进先出** (First in last out, 简称 FILO 或者LIFO) 的元素序列，访问和删除都只能对栈顶的元素(即最后一个被加入栈的元素)进行，并且元素也只能被添加到栈顶。

**栈内的元素不能访问**。如果一定要访问栈内的元素，只能将其上方的元素全部从栈中删除，使之变成栈顶元素才可以。

stack 容器有广泛的应用。例如，编辑器中的 undo (撤销)机制就是用堆栈来记录连续的变化。 撤销操作可以取消最后一个操作，这也是发生在堆栈顶部的操作。



### 栈的常见函数

|   函数名   |    函数说明    |
| :--------: | :------------: |
| push(元素) |      入栈      |
|   pop()    |      出栈      |
|   top()    |  返回栈顶元素  |
|   size()   |  返回元素个数  |
|  empty()   | 判断栈是否为空 |



### 栈的操作

```c++
#include <iostream>
#include <bits/stdc++.h>
using namespace std;

int main() {
	stack<int> s;
	s.push(10); // 入栈
	s.push(20);
	s.push(30);
	cout << s.top() << endl; // 查看栈顶元素
	s.pop(); // 出栈
	cout << s.top() << endl;

	// 向栈中存入元素，直到遇到-1结束
	while (true) {
		int x;
		cin >> x;
		if (x == -1) break;
		s.push(x);
	}
	// 输出栈中所有元素
	while (!s.empty()) {
		cout << s.top() << endl; // 输出栈顶元素
		s.pop(); // 弹出栈顶元素
	}
}
```



## 队列queue

### 什么是队列

queue:  就是“队列”。 队列是**先进先出**的(First in first out), **队头的访问和删除操作只能在队头进行，添加操作只能在队尾进行。不能访问队列中间的元素。**

√ queue 可以用 list 和 deque 实现，默认情况下用 deque 实现。

特点：先进先出 (FIFO), 队尾进，队头出。



### quque的常见函数

|   函数名   |      函数说明      |
| :--------: | :----------------: |
| push(元素) |  进队，从队尾入队  |
|   pop()    |  出队，从队头出队  |
|  front()   |    返回队头元素    |
|   back()   |    返回队尾元素    |
|   size()   | 返回队列中元素个数 |
|  empty()   |  判断队列是否为空  |



### 队列的操作

```c++
#include <iostream>
#include <bits/stdc++.h>
#include <queue>
using namespace std;

int main() {
	queue<int> q;
	q.push(1); // 入队
	q.push(2);
	q.push(3);
	q.push(4);
	// 打印队头队尾
	cout << q.front() << " " << q.back() << endl;
	q.pop(); // 出队
	// 再次打印队头队尾
	cout << q.front() << " " << q.back() << endl;
	// 访问队列元素：相当于将队列元素一直弹出，直到队列为空
	while (!q.empty()) {
		cout << q.front() << endl;
		q.pop();
	}
}
```



### 优先队列priority_queue

priority    queue 是"优先队列"。它和普通队列的区别在于， **优先队列的队头元素总是最大的** — — 即执行pop操作时，删除的总是最大的元素；执行top操作时，返回的是最大元素的引用。

√ priority_queue 可以用 vector 和 deque 实现，默认情况下用 vector 实现。

√ priority_queue默认的元素比较器是 `less <T>`。 也就是说，在默认情况下，要放入 priority_queue 的元素必须是能用“<”运算符进行比较的，而且 priority_queue 保证以下条件总是成立：对于队头的元素 x 和任意非队头的元素 y, 表达式 “x<y”必为 false。

√ priority queue 的第三个类型参数可以用来指定排序规则。

√ 优先队列具有队列的所有特性，包括基本操作，只是在这基础上添加了内部的一个排序。 

√ priority queue **内部并非完全有序，但却能确保最大元素总在队头**。

定义：``priority_queue<Type,Container,Functional>``

√ Type 就是数据类型：

√ Container 就是容器类型(Container 必须是用数组实现的容器，比如 vector,deque 等等，但不能用 list。STL 里面默认用的是vector);

√ Functional 就是比较的方式，当需要用自定义的数据类型时才需要传入这三个参数， 使用基本数据类型时， 只需要传入数据类型， 默认是**大顶堆(大根堆)**。

**priority queue 特 别 适 用 于 " 不 停 地 在 一 堆 元 素 中 取 走 最 大 的 元 素 " 这 种 情 况 。**

priority_queue 插入和删除元素的复杂度都是0(log(n))。 虽然用 set/multiset 也能完成此项工作，但是 priority_queue 比它们略快一些。



### 优先队列的操作

```c++
#include <iostream>
#include <bits/stdc++.h>
#include <queue>
using namespace std;

int main() {
	// 定义一个优先队列，使用默认的比较方式（大跟堆），默认为less比较器
	// priority_queue<int, vector<int>, less<int> > q;
	// priority_queue<int> q; // 和上面的定义等价

	// 定义一个优先队列，使用greater比较器，形成小顶堆
	priority_queue<int, vector<int>, greater<int> > q;

	// 向优先队列中插入元素
	q.push(3);
	q.push(1);
	q.push(4);
	q.push(1);
	q.push(5);
	q.push(2);

	// 访问优先队列的所有元素
	while(q.size()) {
		cout << q.top() << " ";
		q.pop(); // 弹出队列的顶部元素
	}
}
```

```c++
// 优先队列存储结构体

#include <iostream>
#include <bits/stdc++.h>
#include <queue>
using namespace std;

struct Student {
	int num;
	string name;
	int score;

	// 重载小于号运算符
	bool operator<(const Student &s) const {
		// 按照分数从高到低排序，分数相同则按照学号从大到小排序
		if (score < s.score || (score == s.score && num < s.num)) {
			return true; // 当前对象小于参数对象
		}
		return false; // 当前对象不小于参数对象
	}
};

int main() {
	// less<T> 得到的是大顶堆
	// greater<T> 得到的是小顶堆
	priority_queue<Student, vector<Student>,less<Student> > q;
	// 生成结构体对象
	Student s1 = {2, "Tom", 90};
	Student s2 = {1, "Jerry", 98};
	Student s3 = {4, "Alice", 98};
	Student s4 = {3, "Bob", 95};

	// 入队
	q.push(s1);
	q.push(s2);
	q.push(s3);
	q.push(s4);

	// 访问队列元素
	while(q.size()) {
		cout << q.top().num << " " << q.top().name << " " << q.top().score << endl;
		q.pop(); // 出队
	}
}
```



## STL容器总结

**一、容器分类**

1、 顺序容器：是一种各元素之间有顺序关系的线性表，是 一 种线性结构的可序群集。顺序性容器中的每个元素均有固定的位置，除非用删除或插入的操作改变这个位置。**顺序容器的元素排列次序与元素值无关，而是由元素添加到容器里的次序决定。 **顺序容器包括：vector ( 向量)、list (列表)、 deque (队列)。

2、关联容器：关联式容器是非线性的树结构，更准确的说是二叉树结构。各元素之间没有严格的物理上的顺序关系，也就是说元素在容器中并没有保存元素置入容器时的逻辑顺序。 但是关联式容器提供了另一种根据元素特点排序的功能，这样迭代器就能根据元素的特点"顺序地"获取元素。**元素是有序的集合，默认在插入的时候按升序排列。**关联容器包括： map (映射)、 set (集合)。

**二、容器的选择**

1、deque 的使用场景：比如排队购票系统，对排队者的存储可以采用 deque, 支持头端的快速移除，尾端的快速添加。如果采用 vector, 则头端移除时，会移动大量的数据，速度慢。

2、vector与 deque 的比较：

​	(1) deque 支持头部的快速插入与快速移除，这是 deque 的优点。

​	(2) 如果有大量释放操作的话， vector花的时间更少，这跟二者的内部实现有关。

3、list的使用场景：比如公交车乘客的存储，随时可能有乘客下车，支持频繁的不确实位置元素的移除插入。

4、set 的使用场景：比如对手机游戏的个人得分记录的存储，存储要求从高分到低分的顺序排列。

5、map 的使用场景：比如按 ID 号存储十万个用户，想要快速要通过ID 查找对应的用户。 二叉树的查找效率，这时就体现出来了。如果是 vector容器，最坏的情况下可能要遍历完整个容器才能找到该用户。

