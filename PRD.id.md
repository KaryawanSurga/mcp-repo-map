# PRD — MCP Repo Map (Bahasa Indonesia)

**Status:** v0.1.0 siap rilis
**Owner:** KaryawanSurga
**Update terakhir:** 2026-10-08

## 1. Ringkasan

MCP Repo Map adalah MCP server + CLI yang memberi agen AI intelijen struktural ringkas tentang sebuah repository: statistik file dan bahasa, pohon direktori, entry point, definisi simbol, import beserta path hasil resolusi, pencarian reverse-import, dan riwayat git terakhir. Output deterministik, read-only, dan dibatasi token budget.

## 2. Masalah

- Agen memahami codebase dengan membaca file satu per satu — cara termahal untuk memahami struktur.
- Eksplorasi via shell (`find`, `grep -r`, mantra `git log`) berisik, rapuh antar platform, dan tanpa filter.
- Operasi rename/move/delete butuh pencarian reverse-import yang sering dilewatkan agen — import pun rusak diam-diam.
- Ringkasan repo (bahasa, entry point, scripts) dihitung ulang dari nol di setiap task.

## 3. Target pengguna

- Agen coding AI (Claude, Cline, dan klien MCP lainnya) yang menavigasi repo asing.
- Developer yang ingin jawaban lokal cepat "di mana X didefinisikan" dan "siapa yang mengimpor Y".
- Penulis tooling/CI yang butuh ekstraktor struktural tanpa dependency untuk JS/TS/Python.

## 4. Tujuan (v0.1.0)

1. Menyediakan enam MCP tool read-only: `repo_map`, `list_files`, `find_symbol`, `imports_of`, `dependents`, `recent_changes`.
2. Menjawab setiap pertanyaan dengan output ringkas dan terbatas — tidak pernah membuang isi file mentah.
3. Mengekstrak simbol dan import untuk JS, TS, dan Python tanpa dependency parser.
4. Me-resolve import relatif terhadap set file nyata, termasuk konvensi TS `./x.js` → `x.ts` dan import relatif titik Python.
5. Menyediakan CLI kelas satu yang mencerminkan semua tool dengan output `--json`.
6. Melewati noise (node_modules, dist, .git, virtualenv) secara default; aman terhadap symlink dan file raksasa.

## 5. Bukan tujuan

- Parsing penuh atau analisis type-aware (API compiler, integrasi LSP) di v0.1.0.
- Call graph, deteksi dead code, atau otomasi refactoring.
- Bahasa di luar JavaScript, TypeScript, dan Python untuk ekstraksi simbol.
- Menulis ke repository: semua operasi read-only.
- Hosting atau akses repo remote — tool hanya memetakan working tree lokal.

## 6. User story

- Sebagai agen, saya ingin satu panggilan yang memberi tahu bahasa, entry point, dan tata letak repo asing.
- Sebagai agen, saya ingin menemukan di mana simbol didefinisikan tanpa noise grep.
- Sebagai agen, saya ingin daftar reverse-import sebelum me-rename modul.
- Sebagai developer, saya ingin file hotspot dan commit terakhir tanpa menyusun command git.
- Sebagai penulis tool, saya ingin output JSON yang bisa dipipe ke otomasi lain.

## 7. Kebutuhan fungsional

| ID | Kebutuhan |
| --- | --- |
| FR1 | `repo_map` mengembalikan: total file/byte, rincian bahasa (file, byte), entry point dari metadata package plus default, scripts package, dan pohon berkedalaman terbatas dengan hitungan per direktori serta penanda truncation. |
| FR2 | `list_files` menampilkan file dengan ukuran, bisa difilter prefix subdirektori dan ekstensi comma-separated, dengan limit. |
| FR3 | `find_symbol` menemukan definisi berdasarkan nama (substring atau exact, case-insensitive) dengan filter kind (function, class, interface, type, enum, const-fn) dan limit. |
| FR4 | `imports_of` melaporkan setiap import sebuah file dengan kind dan path hasil resolusi bila relatif. |
| FR5 | `dependents` melaporkan setiap file sumber yang mengimpor target, dengan jumlah file dipindai dan flag truncation. |
| FR6 | `recent_changes` melaporkan commit terakhir (hash, tanggal ISO, author, subject) dan 10 hotspot teratas dari riwayat git; non-repo dilaporkan jujur. |
| FR7 | Walker melewati node_modules, dist, output build, .git, virtualenv, cache, dan symlink; menegakkan max depth (12) dan max files (5000). |
| FR8 | Reader melewati file > 1 MB; resolusi import memetakan `./x.js` ke `x.ts/.tsx/.mts/.cts` dan mendukung import relatif titik Python. |
| FR9 | Output map dibatasi token budget perkiraan (default 900) pada batas baris. |
| FR10 | Setiap MCP tool ber-annotasi read-only dan mengembalikan teks error actionable alih-alih throw. |
| FR11 | Command CLI mencerminkan semua tool dengan `--json`, `--limit`, `--ext`, `--dir`, `--exact`, `--kind`, `--max-files`, dan `--budget`; exit code 0/1/2. |

## 8. Kebutuhan non-fungsional

- Node >= 20; dependency runtime hanya MCP SDK dan zod.
- Sorting dan rendering deterministik; output stabil untuk diffing.
- Tanpa penulisan ke repository; tanpa telemetry; tanpa akses jaringan (git berjalan lokal).
- Paritas Windows/macOS/Linux (path forward-slash di output, `windowsHide` di proses anak).
- Test suite mencakup walking, ekstraksi, resolusi, rendering, git, CLI, dan handshake MCP.

## 9. Metrik sukses

- Diadopsi sebagai panggilan orientasi pertama di sesi agen pada repo asing.
- Pengurangan pembacaan file per task navigasi (feedback kualitatif pengguna).
- Install npm dan star bertumbuh dari minggu ke minggu.
- Issue yang meminta ekstraktor bahasa baru (validasi roadmap).

## 10. Catatan teknis

- `walkFiles` adalah BFS-dengan-depth asinkron, melewati set default yang bisa diperluas, di-sort dengan `localeCompare`.
- Ekstraksi simbol line-oriented regex per bahasa dengan guard baris panjang dan file raksasa.
- Resolusi import membangun set file sekali per query; resolusi JS mencoba rewrite `.js`→TS sebelum kandidat suffix/index.
- Rendering tree membangun node tree di memori: 8 entri per direktori, marker `+N more`, indentasi glyph.
- MCP server membungkus setiap tool dengan try/catch, mengembalikan teks `isError`; CLI berbagi helper rendering dengan server.

## 11. Rencana rilis

- **v0.1.0** — enam tool, CLI, ekstraksi JS/TS/Python, resolusi, rendering berbudget, suite 42 test, CI (2026-10-08).
- **v0.2.0** — ekstraktor simbol Go dan Rust; `context_pack` (set file minimal untuk sebuah task).
- **v0.3.0** — resolusi tsconfig path dan workspace; call graph simbol; caching inkremental.

## 12. Pertanyaan terbuka

- Perlukah `find_symbol` mengembalikan nama scope pembungkus untuk definisi bersarang?
- Perlukah `repo_map` menerima path `focus` untuk memperbesar tree ke satu subtree?
- Perlukah hotspot diberi bobot recency alih-alih jumlah perubahan mentah?
