import re
# A question counts for Lightning maths if it asks the child to work out a number (sums, word problems, sequences),
# not recall a fact that happens to be a number ("How many legs does a spider have?").
MATH = re.compile(r"""\b(plus|add|added|take\ away|minus|subtract|times|multiplied|divided|double|half\ of|halve|quarters?\ of|thirds?\ of|fifths?\ of|tenths?\ of|percent|squared|square\ root|cubed|sum\ of|average\ of|altogether|left\ over|share[sd]?|equal\ groups|perimeter|area\ of
 |how\ many\ .*\b(now|left)\b|number\ (?:comes|is\ (?:one|two|ten)\ (?:more|less)|is\ bigger|is\ smaller)|number\ is\ (?:bigger|smaller)|between\ (?:one|two|\d+)\ and|more\ than|less\ than|fewer|pattern|prime|digit|coins?\ make
 |minutes\ are\ in\ (?:\d+|two|three|half)|seconds\ are\ in\ \d+|days\ are\ in\ two|socks\ are\ in\ two)\b""", re.I | re.X)
is_math = lambda q: bool(MATH.search(q))
