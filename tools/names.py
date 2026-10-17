# Popular children's names in Ireland and the UK (born ~2013-2022), plus Irish-language names.
# SAY maps a name to a phonetic spelling so the voice pronounces it properly.
NAMES = """
Jack James Noah Conor Daniel Sean Adam Harry Michael Charlie Luke Oisin Darragh Tadhg Cillian Fionn Liam Thomas Patrick Rian
Bobby Finn Tommy Oliver Cian Max Alex Ryan Dylan Evan Aaron Ben Ethan Jamie Kyle Leo Mason Logan Matthew Nathan Ollie Paddy
Ronan Shane Sam Senan Shay Theo Archie Alfie Arthur Billy Callum Cathal Ciaran Colm Dara David Donnacha Eoghan Eoin Fiachra
Harrison Hugo Jake Jacob John Joseph Joshua Kevin Lorcan Louis Lucas Mark Mateo Niall Odhran Owen Peter Ruairi Rory Samuel
Stephen Tom Tiernan William Zach Zachary Aidan Andrew Anthony Brian Caleb Caolan Christopher Daithi Declan Diarmuid Elliot
Emmet Freddie Gavin George Henry Isaac Jason Jayden Jude Kai Kian Killian Leon Lochlann Mikey Milo Morgan Oscar Ruben Seamus
Teddy Ted Tyler Robert Richard Edward Joe Josh Danny Jonah Ezra Albie Ralph Rocco Reggie Rowan Felix Frankie Jesse Kayden
Toby Benjamin Sebastian Joey Dan Muhammad Mohammed Ali Ibrahim Omar Yusuf Adrian Filip Jakub Kacper Antoni Oran Ross Scott
Calum Lewis Ewan Rhys Hamish Fraser Struan Gerard Brendan Barry Cormac Feargal Fergal Diarmaid Ultan Naoise Ruadhan Turlough
Emily Grace Fiadh Sophie Hannah Amelia Ava Ellie Ella Mia Lucy Emma Lily Olivia Chloe Aoife Caoimhe Saoirse Kate Sadie Molly
Ruby Isla Holly Anna Sarah Zoe Freya Eabha Roisin Ciara Clodagh Niamh Orla Siun Siofra Aine Aisling Alice Amy Annie Bella
Bonnie Charlotte Cara Clara Daisy Eden Eimear Eva Evie Faye Hazel Isabelle Isabella Jessica Julia Katie Kayla Laoise Layla
Leah Lena Lexi Lila Maeve Meabh Maisie Mary Megan Mollie Muireann Nora Nina Orlaith Penny Poppy Rachel Rebecca Rose Rosie
Sienna Sofia Sophia Stella Tara Victoria Willow Aoibhe Aoibhinn Ailbhe Aria Ellen Erin Fiona Grainne Iris Ivy Lauren Lola Luna
Mae Millie Matilda Nell Robyn Rua Sorcha Riona Brid Sile Abigail Amelie Ayla Elsie Emilia Esme Florence Georgia Harper Heidi
Imogen Jasmine Lottie Lucia Margot Maya Nancy Olive Phoebe Pippa Sara Scarlett Thea Zara Zoey Ariana Aurora Callie Darcy Edie
Elizabeth Eliza Ellie-Mae Emilie Gracie Kiera Kerry Laura Lia Lilly Lily-Mae Louise Lyla Maria Marie Maja Zuzanna Hanna Alicia
Caitlin Caitriona Eilish Eileen Enya Fianna Grace-Ann Hollie Jane Joanne Kathleen Katelyn Leanne Mairead Maria-Grace Mya Neasa
Nessa Nuala Orna Rosa Roise Ruth Shauna Shannon Teagan Una Yasmin Aimee Amber Bethany Brooke Eve Harriet Jade Lara Lilah Myla
""".split()

SAY = {
 "oisin": "Usheen", "tadhg": "Tige", "cillian": "Killian", "fionn": "Finn", "rian": "Ree-an", "darragh": "Darra", "sean": "Shawn",
 "cian": "Kee-an", "senan": "Senan", "cathal": "Kahal", "ciaran": "Keer-awn", "colm": "Collum", "donnacha": "Dunnaka",
 "eoghan": "Owen", "eoin": "Owen", "fiachra": "Fee-akra", "odhran": "Oran", "ruairi": "Roo-ree", "caolan": "Kay-lin",
 "daithi": "Dah-hee", "diarmuid": "Dermot", "diarmaid": "Dermot", "lochlann": "Lock-lan", "seamus": "Shay-mus", "kian": "Kee-an",
 "ruadhan": "Roo-awn", "naoise": "Nee-sha", "ultan": "Ultan", "feargal": "Fergal", "cormac": "Kormak", "turlough": "Tur-lock",
 "fiadh": "Fee-a", "aoife": "Ee-fa", "caoimhe": "Kee-va", "saoirse": "Seer-sha", "eabha": "Ay-va", "roisin": "Ro-sheen",
 "niamh": "Neev", "siun": "Shoon", "siofra": "Shee-fra", "aine": "Awn-ya", "aisling": "Ash-ling", "laoise": "Lee-sha",
 "maeve": "Mayv", "meabh": "Mayv", "muireann": "Mur-ren", "orlaith": "Orla", "aoibhe": "Ee-va", "aoibhinn": "Ee-veen",
 "ailbhe": "Al-va", "grainne": "Grawn-ya", "riona": "Ree-ona", "brid": "Breed", "sile": "Shee-la", "sorcha": "Sur-ka",
 "eimear": "Ee-mer", "clodagh": "Clo-da", "ciara": "Keer-a", "caitriona": "Ka-treena", "eilish": "Eye-lish", "mairead": "Ma-raid",
 "neasa": "Nassa", "nuala": "Noo-la", "roise": "Ro-sha", "una": "Oona", "rua": "Roo-a", "fianna": "Fee-anna", "enya": "Enya",
 "siobhan": "Shiv-awn", "sadhbh": "Syve", "orna": "Orna", "rowan": "Ro-an", "kacper": "Kats-per", "jakub": "Yak-oob",
 "zuzanna": "Zoo-zanna", "maja": "My-a", "antoni": "An-tony", "filip": "Fill-ip", "margot": "Mar-go", "esme": "Ez-may",
 "thea": "Thee-a", "lia": "Lee-a", "mya": "My-a", "myla": "My-la",
}

def key(name):
    import unicodedata
    n = unicodedata.normalize("NFD", name.lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return "".join(c for c in n if c.isalnum())
