with open('F:/AI/생산일보/js/modules/injection.js', 'rb') as f:
    raw = f.read()

bom = raw[:3]
content = raw[3:].decode('utf-8')

# Show lines containing U+0080 (\x80)
lines = content.split('\n')
print("=== Lines containing hidden U+0080 ===")
for i, line in enumerate(lines, 1):
    if '\x80' in line:
        # Replace \x80 with visible marker for display
        display = line.replace('\x80', '[◆]')
        print(f"Line {i:4d}: {display[:200]}")

print("\n=== All non-standard sequences ===")
import re
for i, line in enumerate(lines, 1):
    # Show any line that has corrupted Korean (? mixed with non-ASCII)
    if re.search(r'[^\x00-\x7F]\?|\?[^\x00-\x7F]', line) or '\x80' in line:
        display = line.replace('\x80', '[◆]')
        print(f"Line {i:4d}: {repr(display[:150])}")
