# Ship-Info 🚢 SAP CAP Application

[![CI/CD](https://github.com/YOUR-ORG/ship-info/actions/workflows/multi-env.yml/badge.svg)](https://github.com/YOUR-ORG/ship-info/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**SAP CAP Application** für Ship-Datenimport aus Access MDB → SQLite/HANA → Fiori Elements UI

## 🎯 Features

- **MDB → CAP Import** (ShipData.mdb → 1234 Ships + AuxEngines)
- **Multi-Environment** (Local → Dev → Test → Prod)
- **Fiori Elements** List Report (Ships, Engines, Survey Dates)
- **CI/CD GitHub Actions** (MTA + BTP Deploy)
- **Terraform BTP Infra** (HDI Containers)

## 🏗️ Architecture

ShipData.mdb ──(mdb-export)──> ship-info.sqlite ──(cds deploy)──> HANA HDI
│ │
scripts/mdb-to-cap.sh srv/ShipInfoService
│ │
npm run stammdaten /odata/v4/ShipInfoService/Ships
│ │
34 Tabellen (28k rows) Fiori Elements UI


## 🚀 Quick Start

1. Clone & Install
git clone https://github.com/YOUR-ORG/ship-info
cd ship-info
npm install

2. ShipData.mdb bereitstellen
Datenbank von Lloyds herunterladen mft.ihsmarkit.com User: srv_maruk_skfmarine PW: siehe HeyLogin
cp /path/to/ShipData.mdb .

3. Schema + Daten
cds deploy --to sqlite:ship-info.sqlite
oder für HANA-Cloud
cds build --for hana  
cds compile db/ --to json > schema.json


npm run schema # → ship-info.sqlite (skf_zcapn_shipimporter_*)
npm run stammdaten # → 1234 Ships + 100 AuxEngines

4. CAP Server + Fiori Preview
npm run preview # → http://localhost:4004 + http://localhost:4005

5. Ships anzeigen
http://localhost:4004/odata/v4/ShipInfoService/Ships?$top=10


## 📊 Datenübersicht

| Tabelle | Rows | Beschreibung |
|---------|------|--------------|
| `tblShip` | 1234 | Schiffe (LRNO, ShipName, Builder, IMO) |
| `tblAuxEngines` | 100 | Hilfsmaschinen |
| `tblMainEngines` | 456 | Hauptmaschinen |
| `tblSurveyDates` | 234 | Inspektionsdaten |

## 🛠️ Development

### Local Development


Watch Mode (Auto-Reload)
npm run dev

Schema neu generieren
npm run schema

Stammdaten neu importieren
npm run stammdaten

Tests
npm test

## 🌐 CI/CD Pipeline

| Branch | Environment | Approvals | URL |
|--------|-------------|-----------|-----|
| `develop` | Dev | Auto | `ship-info-srv-dev.cfapps.eu10.hana.ondemand.com` |
| `release/*` | Test | 1 Reviewer | `ship-info-srv-test.cfapps.eu10.hana.ondemand.com` |
| `main` | Prod | 2 Reviewers | `ship-info-srv-prod.cfapps.eu10.hana.ondemand.com` |

**Push → main** → **Auto-Test → Manual Approval → Live Deploy (5 Min)**

## 📦 Scripts


npm run schema # cds deploy → ship-info.sqlite
npm run stammdaten # MDB → CAP Tabellen (28k rows)
npm run preview # CAP Server (4004) + Fiori UI (4005)
npm run deploy:dev # → BTP Dev
npm run deploy:test # → BTP Test
npm run deploy:prod # → BTP Prod
npm run hana-full # SQLite → HANA produktiv


## 🔧 Configuration

### `.cdsrc.json`

{
"requires": {
"db": {
"kind": "sqlite",
"credentials": { "database": "ship-info.sqlite" }
}
}
}

## ☁️ BTP Deployment (MTA)

**`mta.yaml`** → **ship-info-srv + ship-info-ui + HANA HDI**


mbt build
cf deploy mta_archives/ship-info_1.0.0.mtar


## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| `no such table: ShipInfoService_tblShip` | `rm *.sqlite && npm run schema && npm run stammdaten` |
| `ShipData.mdb fehlt` | `cp /path/to/ShipData.mdb .` |
| Hartcodierte Pfade | ✅ Dynamisch via `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"` |
| Pipeline failt | GitHub Secrets: `CF_API`, `CF_USERNAME`, `CF_PASSWORD`, `CF_SPACE` |

## 📄 License

MIT License - siehe [LICENSE](LICENSE)

## 🙌 Contributing

1. `git checkout -b feature/xyz`
2. `npm run stammdaten`
3. `git commit -m "feat: add xyz"`
4. `git push origin feature/xyz`
5. **CI/CD** → **Dev Live!** 🎉

---

**Ship-Info = Ships (1234) → Fiori Elements → BTP Prod (Zero-Downtime CI/CD)!** 🚢✅

## Wo kommen die ganzen Icons her

**🚀 Quick Start**  `:rocket: Quick Start`
**📦 Scripts**      `:package: Scripts`  
**✅ Troubleshooting** `:white_check_mark: Troubleshooting`
```

## **2. Direkte Unicode Emojis (kopieren!)**

```
🚀 🛠️ 📦 🔧 ☁️ 🐛 🚢 ✅ 🎯 📊 🌐 
📱 🏗️ 🎉 💾 🔄 ⏭️ 📤 📥 
```

**VS Code Copy-Paste:**
```
Strg+Shift+P → "Emoji: Insert Emoji" → Suche "rocket"
```

## **3. GitHub Emoji Liste (komplett!)**

**Browser:** https://github.com/ikatyang/emoji-cheat-sheet
```
:boom: → 💥 | :fire: → 🔥 | :sparkles: → ✨
:construction: → 🏗️ | :bug: → 🐛 | :rocket: → 🚀
```

## **4. Ship-Info Icons (perfekt passend!)**

```markdown
# Ship-Info 🚢 SAP CAP

## 🎯 Features
- 🚢 **MDB → CAP Import** (1234 Ships)
- ☁️ **Multi-Environment** (Dev/Test/Prod)  
- 📱 **Fiori Elements** List Report
- 🔄 **CI/CD GitHub Actions**
- 🏗️ **Terraform BTP Infra**

## 🚀 Quick Start
```
npm run schema      # 🗄️ ship-info.sqlite
npm run stammdaten  # 📊 1234 Ships
npm run preview     # 👀 localhost:4004
```

## 📦 Scripts
| Script | Icon | Funktion |
|--------|------|----------|
| `schema` | 🗄️ | cds deploy |
| `stammdaten` | 📊 | MDB Import |
| `preview` | 👀 | CAP + Fiori |
```

## **5. VS Code Extensions (Auto-Complete!)**

```
1. "Emoji Sense" → :rocket: → Autocomplete 🚀
2. "Powerline Icons" → DevIcons (package, folder, git)
3. "Material Icon Theme" → Datei-Icons
```

## **6. Nerd Fonts (Terminal!)**

```bash
# WSL/Ubuntu
sudo apt install fonts-hack-nerd-font

# VS Code → Terminal → "Hack Nerd Font"
```

**Icons:** `󰊢 󰉖 󰍘 󰏕 󱏑 󰒲`

## **7. Ship-Info README mit Icons (UPDATE!)**

```markdown
# Ship-Info 🚢 SAP CAP Application

[![CI/CD 🔄](https://github.com/YOUR-ORG/ship-info/actions/workflows/multi-env.yml/badge.svg)](https://github.com/YOUR-ORG/ship-info/actions)

## 🎯 Features
- 🚢 MDB → CAP (1234 Ships!)
- ☁️ Multi-Env (Dev/Test/Prod)
- 📱 Fiori Elements UI
- 🔄 GitHub Actions CI/CD
- 🏗️ Terraform BTP

## 🚀 Quick Start
```
npm install          # 📦 Dependencies
npm run schema       # 🗄️ ship-info.sqlite  
npm run stammdaten   # 📊 28k rows
npm run preview      # 👀 localhost:4004/4005
```

## 🐛 Troubleshooting
| ❌ Problem | ✅ Fix |
|-----------|-------|
| no such table | `rm *.sqlite && npm run schema` |
| MDB fehlt | `cp ShipData.mdb .` |
```

## **8. SOFORT Icons einfügen:**

```
1. :rocket: → 🚀 (GitHub Shortcode)
2. Strg+Shift+P → "Insert Emoji" 
3. Copy-Paste: 🚢📦🔧☁️🐛✅
4. https://emoji.github.com → Suche
```

**`:ship: → 🚢` | `:package: → 📦` | `:bug: → 🐛`** → **automatisch gerendert!** 🎉

**README.md → `:rocket: Quick Start`** → **🚀 Quick Start!** 🚀✅

**Emoji Shortcodes + Unicode = perfekte Icons!** 🎯
