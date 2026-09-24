# พรอมต์สร้างภาพแผนที่โลก — Code Tower

> **สถานะ: ได้ภาพแล้ว (21 ก.ย. 2026)** — เจ้าของโปรเจกต์เจนมา 4 ใบ PM เลือกใบ `GC5CGXAJgBfAhlGB.png`
>
> เหตุผลที่เลือกใบนี้: ทั้งสี่ใบเป็นองค์ประกอบเดียวกัน ต่างกันแค่การไล่สี
> ใบนี้ **แยกพื้นดินออกจากน้ำได้ชัดที่สุด** ซึ่งเป็นสิ่งที่แผนที่ที่ต้องกดต้องการที่สุด
> · ใบโทนส้ม (`IM405…`) น้ำขุ่นจนขอบโซนจม · ใบ `V8-5F…` เมฆบังด้านบนจนภูเขาไฟจาง
> · ใบ `RXEA2…` ดีรองลงมา แต่เทอร์ควอยซ์จัดกว่าและจะตีกับสีทอง/มิ้นต์ของ UI เรา
>
> ไฟล์ที่ใช้จริงอยู่ที่ `client/public/worldmap.jpg` (1920px 358KB) และ
> `client/public/worldmap-small.jpg` (960px 107KB สำหรับมือถือ)
> ต้นฉบับ 2752x1536 เก็บไว้ที่ `docs/mockups/`
>
> **พิกัดพื้นที่กดของแต่ละโซนวัดจากภาพจริงแล้ว** และเขียนลง `gamedata.regions[].hotspot`
> วิธีวัด: วาดวงกลมทับภาพตามพิกัดที่เดา → เปิดดูด้วยตา → ขยับจนตรง → ตรวจด้วยโปรแกรมว่าไม่มีวงไหนทับกัน
>
> เอกสารนี้เก็บไว้เป็นบันทึก เผื่อต้องเจนใหม่ในอนาคต

---

## อ่านก่อนใช้ — ทำไมพรอมต์นี้ไม่ได้เขียนให้ "สวยที่สุด"

ภาพนี้ไม่ได้เป็นแค่ฉากหลัง มันคือ **หน้าจอที่ผู้เล่นต้องกด** ข้อกำหนดสามข้อจึงสำคัญกว่าความสวย:

1. **แต่ละโซนต้องแยกออกจากกันชัด** มีน้ำหรือที่ราบคั่น — ถ้าโซนติดกันเป็นพืด เราวางปุ่มกดทับไม่ได้
   โดยไม่ให้มันซ้อนกัน และผู้เล่นจะกดผิดโซน
2. **กลางโซนต้องโล่งพอ** เพราะเราจะวางป้าย "ชั้น 1–3 · แนะนำเลเวล 5" ทับลงไป ถ้าตรงนั้นมีภูเขา
   รายละเอียดจัด ๆ ตัวหนังสือจะอ่านไม่ออก
3. **ห้ามมีตัวหนังสือในภาพ** เราใส่ชื่อไทยทับเอง และตัวสร้างภาพเขียนตัวอักษรออกมาเป็นขยะเสมอ

ถ้าภาพที่ได้สวยแต่ผิดสามข้อนี้ ให้เจนใหม่ อย่าเสียดาย

---

## พรอมต์หลัก (คัดลอกทั้งก้อน)

```
A vibrant fantasy world map illustration for a video game, viewed from a high three-quarter
aerial angle, like a painted game overworld. Wide 16:9 landscape composition.

The world is a single large floating landmass surrounded by turquoise ocean and soft white
clouds at the edges. EIGHT clearly separated regions, each with its own distinct silhouette
and color identity, arranged with visible open water, plains or rivers between them so that
each region reads as its own island-like zone:

1. TOP-LEFT — an active volcano region: black basalt cliffs, glowing orange lava rivers,
   charred dead trees, dark smoke. Deep red and black palette.
2. TOP-RIGHT — a frozen mountain region: white and pale-blue glaciers, snow-covered pines,
   frozen waterfalls, ice spires. Cold white and cyan palette.
3. CENTER-LEFT — a lush green starter forest: rounded bright-green trees, a small river,
   two or three tiny wooden cottages, gentle hills. Warm friendly green palette.
4. FAR-LEFT — ancient stone ruins: broken grey columns, a large pale skeleton of a huge
   beast half-buried in sand, cracked stone floors. Muted grey and bone-white palette.
5. CENTER — open golden farmland and a crossroads with a small stone plaza, connecting
   paths radiating outward to the other regions.
6. BOTTOM-RIGHT — a grand walled castle city on the coast: blue conical rooftops, white
   stone walls, a harbour with small sailing ships, stone bridges. Blue and cream palette.
7. RIGHT-CENTER — a single extremely tall dark stone tower standing alone on a rocky spur,
   clearly taller than everything else in the image, wrapped in faint mist. It must be the
   most recognizable landmark on the map.
8. BOTTOM-LEFT — scattered small tropical islands in shallow water, connected by wooden
   rope bridges, with a few palm trees and rocky outcrops.

Style: bright saturated painterly game-art illustration, clean readable shapes, soft
directional sunlight from the upper left, gentle ambient occlusion, high detail but
uncluttered, no harsh shadows. Similar to a mobile RPG world-select screen.

Composition rules: keep the CENTER AREA OF EACH REGION relatively flat and visually calm,
with detail concentrated at the region edges, so that labels can be overlaid on top of each
region later. Keep generous empty ocean or plain between regions. No region may touch the
image border except through ocean and clouds.
```

## พรอมต์เชิงลบ (ถ้าตัวสร้างภาพมีช่องแยก ให้ใส่ตรงนั้น — ถ้าไม่มี ต่อท้ายพรอมต์หลักได้)

```
no text, no letters, no numbers, no labels, no captions, no watermark, no signature,
no UI elements, no buttons, no icons, no minimap, no compass rose, no legend,
no characters, no people, no creatures, no animals,
no picture frame, no border, no vignette,
not photorealistic, not dark, not gloomy, not cluttered,
no fog covering the whole image, no heavy grain, no lens flare
```

---

## สเปกทางเทคนิคที่ต้องได้

| เรื่อง | ค่าที่ต้องการ | ทำไม |
|---|---|---|
| สัดส่วน | **16:9** | ตรงกับพื้นที่หน้าจอของเรา ไม่ต้องครอปทิ้ง |
| ความละเอียด | อย่างน้อย **1920×1080** ถ้าได้ 2560×1440 ยิ่งดี | จะย่อลงใช้บนมือถือ แต่ขยายขึ้นไม่ได้ |
| ไฟล์ | **PNG** | JPEG ทำให้ขอบโซนมีรอยเปื้อน ทำให้เขียนพื้นที่กดยากขึ้น |
| ขนาดไฟล์ | ถ้าเกิน 3 MB บอกผม ผมบีบให้ | ผู้เล่นต้องโหลดทุกครั้งที่เปิดเกม |

---

## เจนมาแล้วเช็กสามข้อนี้ก่อนส่ง

- [ ] **นับโซนได้ครบ 8 และแยกออกจากกันจริง** — ลองเอานิ้วชี้ทีละโซน ถ้าชี้แล้วไม่แน่ใจว่าอยู่โซนไหน แปลว่าใช้ไม่ได้
- [ ] **หอคอยเด่นที่สุดในภาพ** — มันเป็นโหมดเกมที่เราสร้างมาทั้งหมดแล้ว ถ้ามันจมหายไปในภาพ ผู้เล่นจะหาไม่เจอ
- [ ] **ไม่มีตัวหนังสือโผล่มาเลยแม้แต่ตัวเดียว**

ถ้าสองในสามข้อผ่านแต่ข้อหนึ่งพลาด ส่งมาได้เลยครับ ผมแก้ด้วยการวาง UI ทับได้บางกรณี — แต่ถ้าโซนติดกันเป็นพืดคือต้องเจนใหม่อย่างเดียว

---

## เจนได้หลายใบ ส่งมาหลายใบได้

ผมเปิดภาพดูเองได้ ส่งมา 3–4 ใบแล้วผมเลือกให้ว่าใบไหนทำเป็นแผนที่กดได้ง่ายที่สุด
บางทีใบที่สวยที่สุดกลับเป็นใบที่ใช้งานยากที่สุด — อันนั้นผมดูให้

**ส่งมาที่ไหนก็ได้:** แนบในแชทนี้ หรือวางไว้ที่ `D:\MIS\Project\code-tower\docs\mockups\` แล้วบอกผม

---

## ถ้าใบแรกออกมารก ให้ลองพรอมต์สำรองนี้

ตัดรายละเอียดลง เน้นให้อ่านง่ายขึ้น แลกกับความอลังการ:

```
A clean stylized fantasy world map for a game menu, high three-quarter aerial view, 16:9.
Eight well-separated island regions on a turquoise sea: a lava volcano, a snowy glacier,
a green forest with cottages, grey bone-filled ruins, golden farmland with a crossroads,
a blue-roofed coastal castle city, a single very tall dark tower on a rock, and small
tropical islets linked by rope bridges.

Flat calm centers, detail only near region edges, wide empty water between regions.
Bright saturated colors, soft even lighting, simple readable shapes, minimal clutter,
painterly mobile-game art style.

no text, no labels, no UI, no characters, no frame, no watermark
```
