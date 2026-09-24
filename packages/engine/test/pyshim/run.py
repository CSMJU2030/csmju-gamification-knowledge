# -*- coding: utf-8 -*-
"""
ตัวรันแบบชุด (batch) ของ differential test

    python3 run.py cases.json out.json            # รันจริง -> การตัดสินใจของแต่ละเคส
    python3 run.py --syntax cases.json out.json   # แค่ compile() -> รับ/ไม่รับ
    python3 run.py --keywords out.json            # รายการคำสงวนของ CPython ตัวนี้

cases.json = [{"name": "...", "source": "...", "state": {...}}, ...]
             (โหมด --syntax ใช้แค่ name กับ source ไม่ต้องมี state)
out.json   = [ผลของแต่ละเคส ตามลำดับเดิม]

รันเป็นชุดเพื่อไม่ต้องเปิดโพรเซส Python ใหม่ 200+ ครั้ง แต่ยังเป็น CPython จริงทุกเคส
(แต่ละเคสได้ globals ของตัวเอง จึงไม่มีสถานะรั่วข้ามกัน)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api  # noqa: E402


def main():
    args = sys.argv[1:]
    if args and args[0] == '--keywords':
        # ไม่ต้องมีไฟล์เข้า — ถาม CPython ว่าคำสงวนของตัวเองมีอะไรบ้าง
        text = json.dumps(api.python_keywords(), ensure_ascii=False)
        if len(args) > 1:
            with open(args[1], 'w', encoding='utf-8') as fh:
                fh.write(text)
        else:
            sys.stdout.write(text)
        return
    syntax_only = False
    if args and args[0] == '--syntax':
        syntax_only = True
        args = args[1:]
    with open(args[0], encoding='utf-8') as fh:
        cases = json.load(fh)
    out = []
    for case in cases:
        name = case.get('name', '<bloxcode>')
        if syntax_only:
            out.append(api.check_syntax(case['source'], name))
        else:
            out.append(api.run_case(case['state'], case['source'], name))
    text = json.dumps(out, ensure_ascii=False)
    if len(args) > 1:
        with open(args[1], 'w', encoding='utf-8') as fh:
            fh.write(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
