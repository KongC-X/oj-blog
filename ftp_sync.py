#!/usr/bin/env python3
"""OJ题解站 FTP 增量同步脚本 — 只上传有变化的文件到龙虾云

优化策略：
1. 本地 manifest 缓存：记录上次同步时每个文件的大小和修改时间
2. 两级对比：先本地 manifest 对比（毫秒级），找出本地有变化的文件
3. MDTM 二次确认：只对本地有变化的文件做 FTP MDTM 查询（文件数很少）
4. 多线程上传：并发传输，充分利用带宽
5. 支持强制全量：--force 参数跳过所有检查
"""

import ftplib
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# 固定排除
EXCLUDES = {'.git', '.github', '.idea', '.vscode', 'node_modules', '__pycache__', '.DS_Store', '.sass-cache'}

# 线程数
MAX_WORKERS = 4

# manifest 文件路径
MANIFEST_FILE = '.sync_manifest.json'


def load_ftpignore(project_dir: Path) -> set:
    ignore_file = project_dir / '.ftpignore'
    extra = set()
    if ignore_file.exists():
        for line in ignore_file.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#'):
                extra.add(line.rstrip('/'))
    return extra


def should_skip(path: Path, ignores: set) -> bool:
    for part in path.parts:
        if part in EXCLUDES or part in ignores:
            return True
    name = path.name
    for pat in ignores:
        if pat.startswith('*'):
            suffix = pat[1:]
            if name.endswith(suffix):
                return True
    return False


def collect_files(local_dir: Path, ignores: set) -> list:
    """收集所有需要上传的文件，返回 (本地路径, 远程路径, 本地大小, mtime) 列表"""
    files = []
    for root, dirs, filenames in os.walk(local_dir):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if d not in EXCLUDES and d not in ignores]
        for name in filenames:
            local_file = root_path / name
            if should_skip(local_file, ignores):
                continue
            rel = local_file.relative_to(local_dir)
            remote_file = str(rel).replace('\\', '/')
            st = local_file.stat()
            files.append((local_file, remote_file, st.st_size, st.st_mtime))
    return files


def load_manifest(project_dir: Path) -> dict:
    """加载上次同步的 manifest"""
    mf = project_dir / MANIFEST_FILE
    if mf.exists():
        try:
            return json.loads(mf.read_text(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_manifest(project_dir: Path, manifest: dict):
    """保存 manifest"""
    mf = project_dir / MANIFEST_FILE
    mf.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')


def find_locally_changed(all_files: list, manifest: dict) -> list:
    """和本地 manifest 对比，找出本地有变化的文件"""
    changed = []
    for local_file, remote_path, size, mtime in all_files:
        # manifest 自身的变化不需要上传
        if remote_path == MANIFEST_FILE:
            continue
        prev = manifest.get(remote_path)
        if not prev:
            # 新文件 → 需要上传
            changed.append((local_file, remote_path, size, mtime))
        elif abs(prev['size'] - size) > 1 or abs(prev['mtime'] - mtime) > 2:
            # 大小或时间有变化 → 可能需要上传
            changed.append((local_file, remote_path, size, mtime))
        # else: 完全相同，跳过
    return changed


def find_remote_deleted(all_files: list, manifest: dict) -> list:
    """找出 manifest 中有但本地已删除的文件（仅记录）"""
    current_paths = {rf for _, rf, _, _ in all_files}
    deleted = [rf for rf in manifest if rf not in current_paths]
    return deleted


def mdtm_check(ftp: ftplib.FTP, remote_dir: str, changed_files: list) -> list:
    """对本地有变化的文件做 MDTM 确认，返回真正需要上传的文件"""
    to_upload = []
    total = len(changed_files)
    if total == 0:
        return to_upload

    print(f'  MDTM 确认 {total} 个可能变化的文件...', flush=True)
    for i, (local_file, remote_path, size, mtime) in enumerate(changed_files):
        full_path = remote_dir.rstrip('/') + '/' + remote_path
        try:
            mdtm = ftp.sendcmd(f'MDTM {full_path}')
            if mdtm.startswith('213 '):
                ts_str = mdtm[4:].strip()
                if len(ts_str) >= 14:
                    remote_ts = datetime.strptime(ts_str[:14], '%Y%m%d%H%M%S').timestamp()
                    # 本地比远程新才上传
                    if mtime - remote_ts <= 2:
                        continue  # 远程已经是新的，跳过
        except Exception:
            pass  # 文件不存在或出错 → 需要上传
        to_upload.append((local_file, remote_path, size, mtime))

        if (i + 1) % 20 == 0:
            print(f'    已检查 {i + 1}/{total}', flush=True)

    return to_upload


def ensure_remote_dir(ftp: ftplib.FTP, remote_dir: str):
    parts = [p for p in remote_dir.replace('\\', '/').split('/') if p]
    if not parts:
        return
    current = ''
    for part in parts:
        current += '/' + part
        try:
            ftp.mkd(current)
        except Exception:
            pass


def ensure_remote_dirs(ftp: ftplib.FTP, remote_base: str, remote_files: list):
    dirs_needed = set()
    for item in remote_files:
        remote_path = item[1]
        parent = str(Path(remote_path).parent)
        if parent != '.':
            dirs_needed.add(parent)
    for d in sorted(dirs_needed):
        ensure_remote_dir(ftp, remote_base.rstrip('/') + '/' + d)


def upload_one(args):
    """上传单个文件（线程函数）"""
    ftp_host, ftp_port, ftp_user, ftp_pass, local_file, remote_full, size = args
    try:
        ftp = ftplib.FTP()
        ftp.connect(ftp_host, ftp_port, timeout=30)
        ftp.login(ftp_user, ftp_pass)
        ftp.set_pasv(True)
        with local_file.open('rb') as f:
            ftp.storbinary(f'STOR {remote_full}', f)
        try:
            ftp.quit()
        except Exception:
            pass
        return (True, remote_full, size, None)
    except Exception as e:
        return (False, remote_full, size, str(e))


def main():
    force_full = '--force' in sys.argv

    project_dir = Path(__file__).parent.resolve()
    config_file = project_dir / 'clawweb-deploy.json'

    if not config_file.exists():
        print(json.dumps({'ok': False, 'message': 'clawweb-deploy.json not found'}, ensure_ascii=False))
        return

    config = json.loads(config_file.read_text(encoding='utf-8'))
    ftp_cfg = config.get('ftp', {})

    host = ftp_cfg.get('host')
    port = ftp_cfg.get('port', 21)
    username = ftp_cfg.get('username')
    password = ftp_cfg.get('password')
    remote_dir = ftp_cfg.get('remote_dir', '/wwwroot')
    site_url = config.get('site_url', '')

    if not all([host, username, password]):
        print(json.dumps({'ok': False, 'message': 'FTP config incomplete'}, ensure_ascii=False))
        return

    ignores = load_ftpignore(project_dir)

    # ===== 1. 扫描本地文件 =====
    t0 = time.time()
    print(f'扫描本地文件...', flush=True)
    all_files = collect_files(project_dir, ignores)
    total_local = len(all_files)
    total_size = sum(s for _, _, s, _ in all_files)
    print(f'  共 {total_local} 个文件，{total_size / 1024 / 1024:.1f} MB', flush=True)

    # ===== 2. 本地 manifest 对比 =====
    if force_full:
        to_upload = [(lf, rf, sz, mt) for lf, rf, sz, mt in all_files]
        print(f'强制全量上传模式', flush=True)
    else:
        manifest = load_manifest(project_dir)
        deleted = find_remote_deleted(all_files, manifest)

        t1 = time.time()
        changed = find_locally_changed(all_files, manifest)
        print(f'  本地对比完成: {len(changed)} 个文件有变化', flush=True)

        if not changed and not deleted:
            # 更新 manifest
            manifest_new = {}
            for lf, rf, sz, mt in all_files:
                manifest_new[rf] = {'size': sz, 'mtime': mt}
            save_manifest(project_dir, manifest_new)

            print(f'所有文件已是最新，无需上传！(总耗时 {time.time() - t0:.1f}s)', flush=True)
            result = {
                'ok': True,
                'uploaded_count': 0,
                'skipped_count': total_local,
                'scan_time': f'{time.time() - t0:.1f}s',
                'site_url': site_url,
                'entry_page': site_url.rstrip('/') + '/index.html' if site_url else '',
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return

        # ===== 3. MDTM 二次确认（只查少量文件） =====
        print(f'连接 {host} 确认远程状态...', flush=True)
        ftp = ftplib.FTP()
        ftp.connect(host, port, timeout=30)
        ftp.login(username, password)
        ftp.set_pasv(True)

        try:
            to_upload = mdtm_check(ftp, remote_dir, changed)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass

        skipped_mdtm = len(changed) - len(to_upload)
        if skipped_mdtm > 0:
            print(f'  MDTM 确认跳过 {skipped_mdtm} 个远程已更新文件', flush=True)

    # ===== 4. 确保远程目录 =====
    if to_upload:
        ftp = ftplib.FTP()
        ftp.connect(host, port, timeout=30)
        ftp.login(username, password)
        ftp.set_pasv(True)
        try:
            ensure_remote_dirs(ftp, remote_dir, to_upload)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass

    skipped = total_local - len(to_upload)
    skipped_size = total_size - sum(s for _, _, s, _ in to_upload)

    # ===== 5. 多线程上传 =====
    if not to_upload:
        print('无需上传的文件！', flush=True)
        # 更新 manifest（全量写入当前状态）
        manifest = {}
        for lf, rf, sz, mt in all_files:
            manifest[rf] = {'size': sz, 'mtime': mt}
        save_manifest(project_dir, manifest)

        result = {
            'ok': True,
            'uploaded_count': 0,
            'skipped_count': total_local,
            'site_url': site_url,
            'entry_page': site_url.rstrip('/') + '/index.html' if site_url else '',
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    upload_size = sum(s for _, _, s, _ in to_upload)
    print(f'上传 {len(to_upload)} 个文件（{upload_size / 1024 / 1024:.1f} MB），跳过 {skipped} 个（{skipped_size / 1024 / 1024:.1f} MB）', flush=True)
    print(f'{MAX_WORKERS} 线程并发上传...', flush=True)

    upload_start = time.time()
    uploaded = 0
    failed = 0
    errors = []

    upload_args = [
        (host, port, username, password, lf, remote_dir.rstrip('/') + '/' + rf, sz)
        for lf, rf, sz, _ in to_upload
    ]

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(upload_one, args): args for args in upload_args}
        for future in as_completed(futures):
            ok, remote_path, size, err = future.result()
            if ok:
                uploaded += 1
            else:
                failed += 1
                errors.append(f'{remote_path}: {err}')
            done = uploaded + failed
            if done % 20 == 0 or done == len(to_upload):
                elapsed = time.time() - upload_start
                speed = (sum(s for _, _, s, _ in to_upload[:done]) / 1024 / 1024) / elapsed if elapsed > 0 else 0
                print(f'  {done}/{len(to_upload)}  成功:{uploaded}  失败:{failed}  {speed:.1f}MB/s', flush=True)

    upload_time = time.time() - upload_start
    total_time = time.time() - t0

    if errors:
        print(f'失败 ({len(errors)}):', flush=True)
        for e in errors[:5]:
            print(f'  - {e}', flush=True)

    # ===== 6. 更新 manifest（全量写入所有文件的当前状态） =====
    manifest = {}
    for lf, rf, sz, mt in all_files:
        manifest[rf] = {'size': sz, 'mtime': mt}
    save_manifest(project_dir, manifest)

    # ===== 7. 更新同步时间 =====
    config['last_sync_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    config_file.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'完成！上传 {uploaded}，跳过 {skipped}，耗时 {total_time:.1f}s（上传 {upload_time:.1f}s）', flush=True)

    result = {
        'ok': failed == 0,
        'uploaded_count': uploaded,
        'skipped_count': skipped,
        'failed_count': failed,
        'total_time': f'{total_time:.1f}s',
        'upload_time': f'{upload_time:.1f}s',
        'site_url': site_url,
        'entry_page': site_url.rstrip('/') + '/index.html' if site_url else '',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
