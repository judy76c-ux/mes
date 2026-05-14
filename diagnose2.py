with open('F:/AI/생산일보/js/modules/injection.js', 'rb') as f:
    raw = f.read()

bom = raw[:3]
content = raw[3:].decode('utf-8')

lines = content.split('\n')
print("=== Lines containing hidden U+0080 (shown with [80] marker) ===")
for i, line in enumerate(lines, 1):
    if '\x80' in line:
        display = line.replace('\x80', '[80]')
        print(f"Line {i:4d}: {display[:200]}")
