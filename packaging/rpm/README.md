# EmbedCalc RPM 仓库

## 快速安装（Fedora / RHEL / CentOS Stream）

### 方法一：一键添加仓库

```bash
# 下载仓库配置
sudo curl -o /etc/yum.repos.d/embedcalc.repo \
  https://spp901780.github.io/embedCalc/embedcalc.repo

# 安装 EmbedCalc
sudo dnf install embedcalc
```

### 方法二：手动添加仓库

1. 创建仓库配置文件：

```bash
sudo tee /etc/yum.repos.d/embedcalc.repo << 'EOF'
[embedcalc]
name=EmbedCalc - 混合进制计算器
baseurl=https://spp901780.github.io/embedCalc/rpm-repo/
enabled=1
gpgcheck=1
gpgkey=https://spp901780.github.io/embedCalc/rpm-repo/repodata/repomd.xml.key
module_hotfixes=1
EOF
```

2. 安装 EmbedCalc：

```bash
sudo dnf install embedcalc
```

## 更新

```bash
sudo dnf update embedcalc
```

## 卸载

```bash
sudo dnf remove embedcalc
```

## 支持的发行版

- Fedora 38+
- RHEL 9+
- CentOS Stream 9+
- 其他兼容 RPM 的发行版

## 仓库结构

```
rpm-repo/
├── repodata/           # 仓库元数据
│   ├── repomd.xml
│   ├── primary.xml.gz
│   └── ...
├── embedcalc-*.rpm     # RPM 包
└── README.md
```

## 故障排除

### GPG 密钥错误

如果遇到 GPG 密钥错误，可以临时禁用 GPG 检查（不推荐）：

```bash
sudo dnf install --nogpgcheck embedcalc
```

或导入密钥：

```bash
sudo rpm --import https://spp901780.github.io/embedCalc/rpm-repo/repodata/repomd.xml.key
```

### 仓库元数据错误

清除缓存并重建：

```bash
sudo dnf clean all
sudo dnf makecache
```
