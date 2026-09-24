# -*- coding: utf-8 -*-
"""
Shim ของ BloxCode สำหรับ CPython จริง — ใช้ใน differential test เท่านั้น

หน้าที่: จำลอง me / enemies / allies / turn_no และฟังก์ชันทั้งหมดของเกม
ให้ "ความหมายเหมือน evaluator ฝั่ง TypeScript เป๊ะ ๆ" แล้วรันโปรแกรมของผู้เล่น
ด้วย CPython จริง ถ้าผลออกมาไม่ตรงกัน = ล่ามของเราผิด

กติกาที่ต้องตรงกันทุกข้อ (docs/bloxcode-language.md §3):
  * การกระทำแรกชนะ — เรียกซ้ำถูกมองข้าม แต่ argument ยังถูกประเมิน (ลำดับสุ่มจึงตรงกัน)
  * cast สกิลที่ไม่มี / MP ไม่พอ / เล็งลิสต์ทั้งที่ไม่ใช่ AoE → ข้ามคำสั่ง ไม่เสียเทิร์น
  * ไม่มีการกระทำเลย → attack(weakest(enemies)) และ line = 0, usedFallback = True
  * exception ระหว่างรัน → หยุดโปรแกรม ใช้การกระทำที่บันทึกไว้แล้ว (ถ้ามี) ไม่งั้น fallback
  * weakest/strongest/fastest เสมอกันเอาตัวที่เจอก่อน  (เหมือน min()/max() ของ Python)
  * random_of ใช้ลำดับเลขสุ่มชุดเดียวกับที่ฝั่ง TS ป้อนมาใน state
"""
import keyword
import sys
import warnings

SELF_TARGET = '__self__'


def python_keywords():
    """คำสงวนของ CPython ตัวที่กำลังรันอยู่จริง ๆ

    เทสต์ต้องดึงรายการจากที่นี่ ไม่ใช่เขียนรายการเองในไฟล์เทสต์ ไม่งั้นคำที่
    "ลืมใส่ในรายการ" จะกลายเป็นคำที่ "ไม่เคยถูกทดสอบ" แทนที่จะเป็นเทสต์แดง
    (soft keyword — match / case / _ — ไม่รวม เพราะ CPython ยังให้ใช้เป็นชื่อได้)
    """
    return {'hard': list(keyword.kwlist), 'soft': list(getattr(keyword, 'softkwlist', []))}


def check_syntax(source, name='<bloxcode>'):
    """CPython รับโปรแกรมนี้ไหม — ใช้ compile() ตัวจริง ไม่ได้รัน

    ต้องแยกจาก run_case() เพราะ run_case จับทุก exception แล้วถอยไปใช้ fallback
    โปรแกรมที่ CPython ปฏิเสธจึงดูเหมือน "รันได้" ทั้งที่จริงแปลไม่ผ่าน
    (SyntaxWarning เช่น True(me) ถูกปิดไว้ เพราะเป็นคำเตือน ไม่ใช่การปฏิเสธ)
    """
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        try:
            compile(source, name, 'exec')
        except SyntaxError as exc:
            # IndentationError / TabError เป็นลูกของ SyntaxError จึงถูกจับตรงนี้ด้วย
            return {'ok': False, 'error': type(exc).__name__, 'msg': str(exc.msg),
                    'line': exc.lineno, 'col': exc.offset}
        except ValueError as exc:
            # เช่น source มี null byte — CPython ปฏิเสธเหมือนกัน แค่คนละชนิด
            return {'ok': False, 'error': 'ValueError', 'msg': str(exc),
                    'line': None, 'col': None}
    return {'ok': True}


class Unit(object):
    """หน่วยรบที่โปรแกรมมองเห็น — ฟิลด์ตรงกับ RuntimeUnit ฝั่ง TypeScript"""

    def __init__(self, d):
        self.id = d['id']
        self.hp = d['hp']
        self.max_hp = d['maxHp']
        self.mp = d['mp']
        self.max_mp = d['maxMp']
        self.level = d['level']
        self.atk = d['atk']
        self.matk = d['matk']
        self.speed = d['speed']
        # `def` เป็นคำสงวนของ Python — สเปกจึงใช้ชื่อ defense / magic_defense
        self.defense = d['def']
        self.magic_defense = d['mdef']
        self.hp_pct = (self.hp / self.max_hp) * 100 if self.max_hp > 0 else 0
        self.mp_pct = (self.mp / self.max_mp) * 100 if self.max_mp > 0 else 0


class Runtime(object):
    def __init__(self, state):
        self.me = Unit(state['me'])
        self.enemies = [Unit(u) for u in state['enemies']]
        self.allies = [Unit(u) for u in state['allies']]
        self.turn_no = state['turn_no']
        self.available = set(state['availableSkills'])
        self.skills = state['skills']          # ชื่อที่เขียนในโค้ด -> {id, mpCost, aoe}
        self.buffs = set(state.get('buffs', []))
        self.debuffs = set(state.get('debuffs', []))
        self.randoms = state['randoms']
        self.rand_i = 0
        self.action = None
        self.warnings = []

    # ---------------------------------------------------------------- utils
    def rand(self):
        v = self.randoms[self.rand_i % len(self.randoms)]
        self.rand_i += 1
        return v

    def tid(self, u):
        return SELF_TARGET if u.id == self.me.id else u.id

    def warn(self, msg):
        if msg not in self.warnings:
            self.warnings.append(msg)

    def line(self):
        # เฟรมที่ 2 = บรรทัดในโปรแกรมของผู้เล่นที่เรียกฟังก์ชันนี้
        return sys._getframe(2).f_lineno

    # ------------------------------------------------------------ pure funcs
    def _pick(self, lst, key, mode, fn):
        if not isinstance(lst, list):
            raise TypeError('%s() needs a list' % fn)
        if len(lst) == 0:
            raise ValueError('%s() needs at least one member' % fn)
        best = lst[0]
        for u in lst[1:]:
            if (key(u) < key(best)) if mode == 'min' else (key(u) > key(best)):
                best = u
        return best

    def weakest(self, lst):
        return self._pick(lst, lambda u: u.hp, 'min', 'weakest')

    def strongest(self, lst):
        return self._pick(lst, lambda u: u.hp, 'max', 'strongest')

    def deadliest(self, lst):
        return self._pick(lst, lambda u: u.atk, 'max', 'deadliest')

    def fastest(self, lst):
        return self._pick(lst, lambda u: u.speed, 'max', 'fastest')

    def random_of(self, lst):
        if not isinstance(lst, list):
            raise TypeError('random_of() needs a list')
        if len(lst) == 0:
            raise ValueError('random_of() needs at least one member')
        return lst[int(self.rand() * len(lst))]

    def count(self, lst):
        if not isinstance(lst, list):
            raise TypeError('count() needs a list')
        return len(lst)

    def has_buff(self, s):
        return s in self.buffs

    def has_debuff(self, s):
        return s in self.debuffs

    def can_cast(self, s):
        info = self.skills.get(s)
        if info is None:
            return False
        return info['id'] in self.available and self.me.mp >= info['mpCost']

    # ---------------------------------------------------------- action funcs
    def attack(self, target):
        line = self.line()
        if self.action is not None:
            return
        if not isinstance(target, Unit):
            self.warn('attack-needs-unit')
            return
        self.action = {
            'action': 'attack', 'targetId': self.tid(target),
            'line': line, 'usedFallback': False,
        }

    def cast(self, name, target):
        line = self.line()
        if self.action is not None:
            return
        info = self.skills.get(name)
        if info is None or info['id'] not in self.available:
            self.warn('missing-skill:%s' % name)
            return
        if self.me.mp < info['mpCost']:
            self.warn('low-mp:%s' % name)
            return
        if isinstance(target, list):
            if not info['aoe']:
                self.warn('not-aoe:%s' % name)
                return
            self.action = {
                'action': 'skill', 'skillId': info['id'],
                'line': line, 'usedFallback': False,
            }
            return
        if not isinstance(target, Unit):
            self.warn('cast-needs-target:%s' % name)
            return
        self.action = {
            'action': 'skill', 'skillId': info['id'], 'targetId': self.tid(target),
            'line': line, 'usedFallback': False,
        }

    def defend(self):
        line = self.line()
        if self.action is None:
            self.action = {'action': 'defend', 'line': line, 'usedFallback': False}

    def wait(self):
        line = self.line()
        if self.action is None:
            self.action = {'action': 'wait', 'line': line, 'usedFallback': False}

    # ---------------------------------------------------------------- result
    def globals_for_program(self):
        return {
            '__builtins__': {'len': len},
            'me': self.me,
            'enemies': self.enemies,
            'allies': self.allies,
            'turn_no': self.turn_no,
            'weakest': self.weakest,
            'strongest': self.strongest,
            'deadliest': self.deadliest,
            'fastest': self.fastest,
            'random_of': self.random_of,
            'count': self.count,
            'has_buff': self.has_buff,
            'has_debuff': self.has_debuff,
            'can_cast': self.can_cast,
            'attack': self.attack,
            'cast': self.cast,
            'defend': self.defend,
            'wait': self.wait,
        }

    def finish(self):
        if self.action is not None:
            out = dict(self.action)
        elif len(self.enemies) > 0:
            best = self.enemies[0]
            for u in self.enemies:
                if u.hp < best.hp:
                    best = u
            out = {
                'action': 'attack', 'targetId': self.tid(best),
                'line': 0, 'usedFallback': True,
            }
        else:
            out = {'action': 'wait', 'line': 0, 'usedFallback': True}
        out['warnings'] = list(self.warnings)
        out['randomsUsed'] = self.rand_i
        return out


def run_case(state, source, name='<bloxcode>'):
    """รันโปรแกรม 1 ตัวแล้วคืนการตัดสินใจในรูปแบบเดียวกับ TurnDecision"""
    rt = Runtime(state)
    g = rt.globals_for_program()
    try:
        exec(compile(source, name, 'exec'), g)
        turn = g.get('turn')
        if turn is None:
            raise NameError('turn() is not defined')
        turn()
    except Exception as exc:  # เทียบเท่า Abort ฝั่ง TS: หยุดโปรแกรม ใช้ผลเท่าที่มี
        rt.warn('runtime-error:%s' % type(exc).__name__)
    return rt.finish()
