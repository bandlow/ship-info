#!/bin/bash
cd /mnt/e/"SAP CAP"/mdb-import

MDB_PATH="ShipData.mdb"
CAP_DB="shipdata.sqlite"

echo "🚀 CAP Schema (LIKE Namespace) → MDB Import"

# 1. CAP Schema check
if [ ! -f "$CAP_DB" ]; then
  echo "❌ cds deploy --to sqlite:shipdata.sqlite zuerst!"
  exit 1
fi

# 2. Namespace Prefix aus erster Tabelle
NAMESPACE_PREFIX=$(sqlite3 "$CAP_DB" "
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name LIKE '%_%' 
  LIMIT 1
" | head -1 | sed 's/_tbl[A-Za-z0-9]*$//')

if [ -z "$NAMESPACE_PREFIX" ]; then
  echo "❌ Kein Namespace-Prefix gefunden!"
  exit 1
fi

echo "📋 Namespace: $NAMESPACE_PREFIX"

# 3. MDB Tabellen (clean!)
MDB_TABLES=$(mdb-tables "$MDB_PATH" | tr -d '\r' | grep -v '^ShipData.mdb$')
echo "📋 MDB Tabellen: $(echo "$MDB_TABLES" | head -3) $([ $(echo "$MDB_TABLES" | wc -l) -gt 3 ] && echo "... ($(echo "$MDB_TABLES" | wc -l) total)")"

# 4. **NUR CAP Schema-Tabellen** (LIKE Namespace!)
CAP_TABLES=$(sqlite3 "$CAP_DB" "
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name LIKE '${NAMESPACE_PREFIX}%' 
  ORDER BY name
")

echo "📋 CAP Schema-Tabellen ($NAMESPACE_PREFIX%):"
echo "$CAP_TABLES"

# 5. CAP Schema → MDB Mapping + Import
echo "📥 Nur CAP Schema-Tabellen importieren..."
count_total=0
while IFS= read -r cap_table; do
  # Namespace abtrennen
  mdb_table=$(echo "$cap_table" | sed "s/^${NAMESPACE_PREFIX}[_]*//")
  
  echo "🔄 $cap_table → $mdb_table"
  
  # CAP Tabelle leeren
  sqlite3 "$CAP_DB" "DELETE FROM \"$cap_table\";"
  
  # MDB Tabelle gefunden?
  if echo "$MDB_TABLES" | grep -q "$mdb_table"; then

  echo "Command: mdb-export -H -I sqlite \"$MDB_PATH\" \"$mdb_table\" | sqlite3 \"$CAP_DB\""
  
  mdb-export -H -N "$NAMESPACE_PREFIX" -I sqlite "$MDB_PATH" "$mdb_table" | \
  # sed "s/INSERT INTO \`$mdb_table\` /INSERT INTO \`$cap_table\`/g" | \
  sqlite3 "$CAP_DB"
count=$(sqlite3 ""$CAP_DB"" "SELECT COUNT(*) FROM $cap_table;")
echo "✅ $count rows in $cap_table"

  else
    echo "  ⚠️  $mdb_table nicht in MDB"
  fi
done <<< "$CAP_TABLES"

echo "🎉 Fertig! $count_total rows in $NAMESPACE_PREFIX% Tabellen"
echo "📊 shipdata.sqlite: $(du -h "$CAP_DB")"
