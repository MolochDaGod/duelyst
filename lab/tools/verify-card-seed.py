"""Load the generated D1 seed into in-memory SQLite and sanity-check it."""
import sqlite3
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "grudge-cards.sql"
db = sqlite3.connect(":memory:")
db.executescript(open(path, encoding="utf8").read())

q = lambda s: db.execute(s).fetchall()
print("cards      ", q("select count(*) from grudge_cards")[0][0])
print("art        ", q("select count(*) from grudge_card_art")[0][0])
print("by source  ", q("select source, count(*) from grudge_cards group by 1"))
print("orphan art ", q("select count(*) from grudge_card_art a "
                       "left join grudge_cards c on c.uuid=a.card_uuid "
                       "where c.uuid is null")[0][0])
print("no art     ", q("select count(*) from grudge_cards c where not exists "
                       "(select 1 from grudge_card_art a where a.card_uuid=c.uuid)")[0][0])
print("bad url    ", q("select count(*) from grudge_card_art where url not like 'http%'")[0][0])
print("dup uuid   ", q("select count(*) from (select uuid from grudge_cards "
                       "group by 1 having count(*)>1)")[0][0])
print("art roles  ", q("select role, count(*) from grudge_card_art group by 1 "
                       "order by 2 desc limit 6"))
print("clips      ", q("select count(*) from grudge_card_clips")[0][0])
print("frames     ", q("select coalesce(sum(frames),0) from grudge_card_clips")[0][0])
print("orphan clip", q("select count(*) from grudge_card_clips k "
                       "left join grudge_cards c on c.uuid=k.card_uuid "
                       "where c.uuid is null")[0][0])
print("clip mism. ", q("select count(*) from grudge_cards c where c.clip_count <> "
                       "(select count(*) from grudge_card_clips k where k.card_uuid=c.uuid)")[0][0])
print("units w/o  ", q("select count(*) from grudge_cards where source='duelyst' "
                       "and clip_count=0")[0][0])
print("vfx art    ", q("select count(*) from grudge_card_art where role like 'vfx:%'")[0][0])
print("top clips  ", q("select name, count(*), sum(frames) from grudge_card_clips "
                       "group by 1 order by 2 desc limit 8"))
print("sample     ", q("select uuid, name, faction from grudge_cards "
                       "where source='grudawars' limit 2"))
