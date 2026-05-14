import re, sys

with open('F:/AI/생산일보/js/modules/injection.js', 'rb') as f:
    raw = f.read()
has_bom = raw[:3] == b'\xef\xbb\xbf'
if has_bom:
    raw = raw[3:]
content = raw.decode('utf-8')

fixes = 0
lines = content.split('\n')
new_lines = []

for lineno, line in enumerate(lines, 1):
    # Count single quotes on this line (excluding comments)
    stripped = line.strip()
    if stripped.startswith('//') or stripped.startswith('*'):
        new_lines.append(line)
        continue
    
    # Count ' chars in the line
    quote_count = line.count("'")
    
    # If odd number and line ends (before \r) with ? after Korean chars
    line_rstrip = line.rstrip('\r\n')
    if quote_count % 2 != 0 and line_rstrip.endswith('?'):
        # Check if there's a non-ASCII char in the line
        has_korean = any(ord(c) > 0x7F for c in line)
        if has_korean:
            # Add closing quote after the trailing ?
            # Replace the trailing ? with ?'
            if line.endswith('\r\n'):
                line = line_rstrip + "'\r\n"
            elif line.endswith('\r'):
                line = line_rstrip + "'\r"
            elif line.endswith('\n'):
                line = line_rstrip + "'\n"
            else:
                line = line_rstrip + "'"
            fixes += 1
            print(f'Line {lineno}: added closing quote')
    
    new_lines.append(line)

fixed = '\n'.join(new_lines)

out = fixed.encode('utf-8')
if has_bom:
    out = b'\xef\xbb\xbf' + out
with open('F:/AI/생산일보/js/modules/injection.js', 'wb') as f:
    f.write(out)
print(f'Done: {fixes} fixes applied')
