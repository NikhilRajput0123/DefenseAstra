import sys
content = open('src/dataset.py', encoding='utf-8').read()
pairs = [
    ('\u2713 All shape/dtype checks passed.', '[OK] All shape/dtype checks passed.'),
    ('\u2717 SMOKE TEST FAILED:', '[FAIL] SMOKE TEST FAILED:'),
    ('train\u2229val=', 'train&val='),
    ('train\u2229test=', 'train&test='),
    ('val\u2229test=', 'val&test='),
    ('\u2717 LEAKAGE DETECTED:', '[FAIL] LEAKAGE DETECTED:'),
    ('\u2713 No sample_id overlap', '[OK] No sample_id overlap'),
    ('\u2717 Leakage check failed:', '[FAIL] Leakage check failed:'),
    ('PASSED \u2713', 'PASSED'),
    ('FAILED \u2717', 'FAILED'),
]
for old, new in pairs:
    content = content.replace(old, new)
open('src/dataset.py', 'w', encoding='utf-8').write(content)
print('Fixed Unicode in dataset.py')
