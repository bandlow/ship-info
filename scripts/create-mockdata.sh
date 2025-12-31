#!/bin/bash
mdb-tables -1 ShipData.mdb | head -50 | xargs -I {} \
 sh -c 'mdb-export ShipData.mdb {} | head -100 > test/data/{}.csv'
   
echo "✅ $(find test/data -name '*.csv' | wc -l) CSV files exported"