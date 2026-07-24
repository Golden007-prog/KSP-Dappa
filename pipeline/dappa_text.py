"""KSP DAPPA synthetic data engine - name pools, MO vocabulary, BriefFacts.

Kannada-region name pools and 2-4 sentence template narratives. Planted repeat
offenders reuse one fixed MO dict so their BriefFacts share vocabulary (this is
what identity-resolution + MO clustering in analytics latch onto).
"""

MALE_FIRST = ["Ravi", "Manjunath", "Shivakumar", "Nagaraj", "Prakash", "Suresh",
              "Ramesh", "Mahesh", "Girish", "Harish", "Santhosh", "Kiran",
              "Lokesh", "Umesh", "Venkatesh", "Srinivas", "Anand", "Basavaraj",
              "Chandrashekar", "Dinesh", "Ganesh", "Gopal", "Krishnappa",
              "Mallikarjun", "Muniraju", "Narayana", "Raghavendra", "Rajesh",
              "Sandeep", "Shankar", "Siddaraju", "Somashekar", "Sudeep",
              "Thimmaiah", "Veeresh", "Vinay", "Yogesh", "Puneeth", "Darshan",
              "Abhishek"]
FEMALE_FIRST = ["Lakshmamma", "Saraswathi", "Manjula", "Shobha", "Sumithra",
                "Gayathri", "Bhagya", "Roopa", "Asha", "Rekha", "Savitha",
                "Nandini", "Pallavi", "Deepa", "Kavya", "Shruthi", "Divya",
                "Meena", "Padma", "Jyothi", "Anitha", "Sowmya", "Chaitra",
                "Vani", "Geetha"]
SURNAMES = ["Gowda", "Shetty", "Hegde", "Rao", "Naik", "Reddy", "Kumar",
            "Poojary", "Achar", "Bhat", "Kulkarni", "Desai", "Patil", "Swamy",
            "Murthy", "Setty", "Angadi", "Byadgi", "Hiremath", "Jois"]

# alternate spellings used to create offender name variants
SPELL_VARIANTS = {"Kumar": "Kumaar", "Shetty": "Shetti", "Gowda": "Gouda",
                  "Naik": "Nayak", "Hegde": "Hegade", "Poojary": "Poojari",
                  "Setty": "Shetty", "Ravi": "Ravee", "Suresh": "Suresha",
                  "Ramesh": "Ramesha", "Mahesh": "Mahesha", "Nagaraj": "Nagaraja",
                  "Manjunath": "Manjunatha", "Shivakumar": "Shivakumara"}

WEAPONS = ["knife", "machete", "country-made pistol", "iron rod", "wooden club"]
VEHICLES = ["two-wheeler without number plate", "black Pulsar motorcycle",
            "stolen scooter", "white autorickshaw", "grey Maruti Omni van"]
ENTRY_METHODS = ["gas-cutter on the shutter", "lock-breaking with an iron rod",
                 "window grill removal", "duplicate key entry",
                 "roof tile removal"]
APPROACHES = ["posing as fake police on beat duty",
              "an OTP fraud call claiming KYC expiry",
              "loan-app threat messages", "a courier-parcel scam call",
              "posing as bank staff for card renewal"]
ITEMS = ["a gold mangalsutra", "a mobile phone", "cash of Rs 42,000",
         "a gold chain of 25 grams", "two silver anklets",
         "a laptop bag with documents"]
LOCALITY_SPOTS = ["the main road", "a residential layout", "the market area",
                  "the bus stand vicinity", "an apartment complex",
                  "the old town lanes"]


def pick_name(rng, gender_id):
    """gender_id: 1=M, 2=F, 3=T (T drawn from male pool)."""
    first = rng.choice(FEMALE_FIRST) if gender_id == 2 else rng.choice(MALE_FIRST)
    return f"{first} {rng.choice(SURNAMES)}"


def name_variants(rng, canonical):
    """Generate up to 4 distinct display variants of a canonical 'First Last'."""
    first, last = canonical.split(" ", 1)
    out = [canonical,
           f"{canonical} {rng.choice('BCDGHKMNRSV')}",   # trailing village initial
           f"{first[0]} {last}",
           f"{first} {last[0]}"]
    sp_first = SPELL_VARIANTS.get(first)
    sp_last = SPELL_VARIANTS.get(last)
    if sp_first:
        out.append(f"{sp_first} {last}")
    if sp_last:
        out.append(f"{first} {sp_last}")
    seen, uniq = set(), []
    for v in out:
        if v not in seen:
            seen.add(v)
            uniq.append(v)
    return uniq[: 2 + rng.randrange(3)]  # 2-4 variants


def random_mo(rng):
    return {"weapon": rng.choice(WEAPONS), "vehicle": rng.choice(VEHICLES),
            "entry": rng.choice(ENTRY_METHODS), "approach": rng.choice(APPROACHES),
            "item": rng.choice(ITEMS), "spot": rng.choice(LOCALITY_SPOTS)}


# BriefFacts templates: 2-4 sentence narratives keyed by subhead.
# Placeholders: {c}=complainant, {v}=victim, {a}=accused-or-'unknown persons',
# {station}, {spot}, {tod}, {weapon}, {vehicle}, {entry}, {approach}, {item}
BRIEF_TEMPLATES = {
    101: "The complainant {c} reported that the victim {v} was assaulted with a {weapon} at {spot} near {station} limits during the {tod}. The victim succumbed to injuries on the spot. {a} fled the scene and a case of murder has been registered. Inquest and scene-of-crime procedures were completed.",
    102: "On the statement of {c}, it is alleged that {a} attacked the victim {v} with a {weapon} at {spot} during the {tod} with intent to kill. The victim sustained serious injuries and was shifted to the government hospital. Investigation has been taken up.",
    103: "The complainant {c} stated that a quarrel at {spot} during the {tod} escalated and {a} assaulted the victim {v} with a {weapon} causing grievous injuries. The injured was treated at the taluk hospital. A case has been registered against the accused.",
    104: "The complainant {c} reported that the victim {v} was forcibly taken away from {spot} during the {tod} by {a} in a {vehicle}. Search teams were formed and neighbouring stations were alerted. Investigation is in progress.",
    201: "Based on the confidential statement of the victim recorded before the lady officer, a case has been registered against {a} for sexual assault that occurred at {spot} during the {tod}. Medical examination was conducted at the district hospital. Further investigation is entrusted to the jurisdictional officer.",
    202: "The complainant {c} stated that her husband and in-laws subjected her to physical and mental cruelty at their residence near {station} over a prolonged period, including demands for additional dowry. She was treated for injuries after an incident during the {tod}. A case has been registered.",
    203: "The complainant {c} reported that {a} outraged the modesty of the victim {v} at {spot} during the {tod}. The accused also hurled abuses when confronted by passers-by. A case has been registered and statements recorded.",
    204: "It is reported by {c} that the victim {v} died under unnatural circumstances at her matrimonial home near {station} within seven years of marriage, following persistent dowry harassment. Inquest was conducted in the presence of the taluk executive magistrate. A case has been registered against the husband and in-laws.",
    301: "The complainant {c} reported that a gang of five to six persons armed with {weapon}s waylaid the victims at {spot} during the {tod} and committed dacoity of {item} and cash. The gang escaped in a {vehicle}. Special teams have been formed to trace the accused.",
    302: "The complainant {c} stated that {a} threatened him with a {weapon} at {spot} during the {tod} and robbed {item}. The accused escaped on a {vehicle}. A case has been registered and CCTV footage of the vicinity is being examined.",
    303: "During the {tod}, the house of the complainant {c} at {spot} was broken open by {entry} while the inmates were away. {a} committed theft of {item} and cash. The scene was inspected with the dog squad and fingerprint experts. Efforts are on to trace the accused who escaped on a {vehicle}.",
    304: "The complainant {c} reported that during the daytime, her locked house at {spot} was opened by {entry} and {item} was stolen. Neighbours noticed a {vehicle} near the gate during the {tod}. A case has been registered.",
    305: "The complainant {c} reported theft of {item} from {spot} during the {tod}. {a} took advantage of the crowd and escaped. A case has been registered and nearby CCTV cameras are being verified.",
    306: "The complainant {c} reported that his vehicle parked at {spot} was stolen during the {tod}. The lock appears to have been tampered by {entry}. {a} are suspected to have escaped towards the highway. Vehicle details have been circulated to all check-posts.",
    307: "The complainant {c} stated that while she was walking near {spot} during the {tod}, {a} riding a {vehicle} snatched {item} from her neck and sped away. She sustained minor injuries in the incident. A case has been registered and rider details are being verified from CCTV.",
    401: "The complainant {c} reported that {a} induced him to part with funds on the promise of high returns and business partnership, and cheated him of {item} and cash. The transactions occurred near {station} during business hours. Documents have been seized and a case registered.",
    402: "The complainant {c}, on behalf of his firm near {station}, reported that {a} entrusted with valuables and accounts dishonestly misappropriated {item} and cash during the {tod}. Records were secured for audit. A case of criminal breach of trust has been registered.",
    403: "Acting on credible information, the officers intercepted {a} at {spot} during the {tod} and seized counterfeit currency notes along with printing material. The complainant {c} of the detection team lodged the report. A case has been registered.",
    501: "The complainant {c} reported receiving {approach}, following which an amount was fraudulently debited from his bank account. The fraudster kept the complainant engaged on the call during the {tod} and obtained the OTP. The cyber cell has been alerted and the money trail is being traced.",
    502: "The complainant {c} reported that his identity documents and card credentials were misused by {a} after {approach}. Unauthorized transactions were noticed during the {tod}. A case under the IT Act has been registered and the service provider has been notified.",
    503: "The complainant {c} reported that {a} circulated defamatory and obscene content about the victim {v} on social media during the {tod}, and sent threatening messages using {approach}. Screenshots were secured in the presence of witnesses. A case has been registered.",
    601: "The complainant, {c} of the jurisdictional station, reported that during the {tod} a mob armed with {weapon}s gathered at {spot} and indulged in rioting, damaging public property. Lathi-charge was resorted to and the mob dispersed. Cases have been registered against the identified persons.",
    602: "The complainant {c} reported that {a} formed an unlawful assembly at {spot} during the {tod} in defiance of prohibitory orders. The assembly was dispersed peacefully. A case has been registered.",
    701: "On credible information, the raiding party intercepted {a} at {spot} during the {tod} and seized contraband ganja along with a {vehicle} used for transport. The complainant {c} of the detection staff lodged the report. Seizure was effected in the presence of panch witnesses.",
    702: "Acting on specific intelligence, the special team stopped a {vehicle} at {spot} during the {tod} and recovered commercial quantity of contraband concealed in the vehicle. {a} were taken into custody on the report of {c}. Forward and backward linkages are being investigated.",
    801: "The complainant {c} reported that the victim {v} left home near {station} during the {tod} and has not returned since. Searches in hospitals and with relatives yielded no result. A missing person report has been registered and the description circulated to all units.",
    802: "The complainant {c} reported that the victim {v} was found dead at {spot} during the {tod} under circumstances suggesting an accidental fall. Inquest proceedings were conducted and the body was shifted for post-mortem examination. A UDR case has been registered pending final opinion.",
}

TOD_BY_PROFILE = {"night": "night hours", "business": "business hours",
                  "evening": "evening hours", "day": "daytime", "flat": "day"}


def compose_brief(rng, sub_id, hour_profile, ctx):
    """ctx keys: c, v, a, station, mo (dict). Returns a 2-4 sentence narrative."""
    mo = ctx["mo"]
    text = BRIEF_TEMPLATES[sub_id].format(
        c=ctx["c"], v=ctx.get("v", "the victim"), a=ctx.get("a", "unknown persons"),
        station=ctx["station"], spot=mo["spot"], tod=TOD_BY_PROFILE[hour_profile],
        weapon=mo["weapon"], vehicle=mo["vehicle"], entry=mo["entry"],
        approach=mo["approach"], item=mo["item"])
    return text
