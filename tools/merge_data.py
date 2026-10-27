"""Junta courses.json e os arquivos de perguntas em public/data/."""
import json, glob, os, sys, random
src = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/data"
out = os.path.join(os.path.dirname(__file__), "..", "public", "data")
courses = json.load(open(f"{src}/courses.json", encoding="utf-8"))
ids = {l["id"] for c in courses for s in c["subjects"] for l in s["lessons"]}
quiz = {}
for f in sorted(glob.glob(f"{src}/quiz/*.json")):
    d = json.load(open(f, encoding="utf-8"))
    for vid, qs in d.items():
        assert vid in ids, (f, vid)
        for k, q in enumerate(qs):
            assert len(q["o"]) == 4 and 0 <= q["a"] <= 3 and q["q"] and q["e"], (f, vid)
            # Embaralha as alternativas de forma determinística para a correta não cair sempre na mesma letra.
            right = q["o"][q["a"]]
            random.Random(f"{vid}-{k}").shuffle(q["o"])
            q["a"] = q["o"].index(right)
        quiz[vid] = qs
json.dump(courses, open(f"{out}/courses.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(quiz, open(f"{out}/quiz.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(ids)} aulas, {len(quiz)} com perguntas, {sum(len(v) for v in quiz.values())} perguntas")
