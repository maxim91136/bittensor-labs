"""Tests für die Abläufe der Datenskripte (Abruf, KV, Hauptprogramm).

Kein Netzzugriff: Alle Abrufe (urllib, requests) werden durch Attrappen ersetzt.
Geprüft wird, dass die Skripte Antworten richtig verarbeiten, Fehler abfangen
und Zeitfelder nicht verfälschen.
"""
import importlib.util
import io
import json
import os
import sys
import tempfile
import types
import unittest
import urllib.error
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

try:
    import requests  # noqa: F401
except ImportError:  # der Prüflauf hat requests nicht; die Abrufe werden ohnehin ersetzt
    sys.modules["requests"] = types.ModuleType("requests")

SKRIPTE = Path(__file__).resolve().parent.parent / ".github" / "scripts"


def lade(name):
    spec = importlib.util.spec_from_file_location(name + "_ablauf", SKRIPTE / (name + ".py"))
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


owner = lade("fetch_owner_dump_score")
top = lade("publish_top_history")
wallets = lade("fetch_top_wallets")
kvf = lade("kv_fallback")
ath = lade("fetch_ath_atl")
taostats = lade("fetch_taostats")


def still():
    """Ausgaben der Skripte schlucken."""
    return _Still()


class _Still:
    def __enter__(self):
        self._o, self._e = redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO())
        self.out = self._o.__enter__()
        self._e.__enter__()
        return self

    def __exit__(self, *a):
        self._e.__exit__(*a)
        self._o.__exit__(*a)
        return False


def urlantwort(daten, status=200):
    a = mock.MagicMock()
    a.status = status
    a.read.return_value = json.dumps(daten).encode("utf-8")
    a.__enter__.return_value = a
    return a


def reqantwort(daten=None, status=200):
    a = mock.MagicMock()
    a.status_code = status
    a.ok = 200 <= status < 300
    a.json.return_value = daten
    if not a.ok:
        a.raise_for_status.side_effect = OSError("HTTP %d" % status)
    return a


def iso(tage_zurueck):
    return (datetime.now(timezone.utc) - timedelta(days=tage_zurueck)).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------- Owner Dump Score

class OwnerKvTests(unittest.TestCase):
    def setUp(self):
        p = [mock.patch.object(owner, n, "x") for n in ("CF_ACCOUNT_ID", "CF_API_TOKEN", "CF_METRICS_NAMESPACE_ID")]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def test_lesen_ok_und_fehler(self):
        with mock.patch.object(owner.requests, "get", create=True, return_value=reqantwort({"a": 1})):
            self.assertEqual(owner.read_from_kv("k"), {"a": 1})
        with mock.patch.object(owner.requests, "get", create=True, return_value=reqantwort(None, 404)):
            self.assertIsNone(owner.read_from_kv("k"))
        with still(), mock.patch.object(owner.requests, "get", create=True, side_effect=OSError("weg")):
            self.assertIsNone(owner.read_from_kv("k"))

    def test_schreiben_ok_und_fehler(self):
        with mock.patch.object(owner.requests, "put", create=True, return_value=reqantwort({}, 200)):
            self.assertTrue(owner.write_to_kv("k", "{}"))
        with mock.patch.object(owner.requests, "put", create=True, return_value=reqantwort({}, 500)):
            self.assertFalse(owner.write_to_kv("k", "{}"))
        with still(), mock.patch.object(owner.requests, "put", create=True, side_effect=OSError("weg")):
            self.assertFalse(owner.write_to_kv("k", "{}"))

    def test_ohne_zugang_nichts(self):
        with mock.patch.object(owner, "CF_API_TOKEN", None), still():
            self.assertIsNone(owner.read_from_kv("k"))
            self.assertFalse(owner.write_to_kv("k", "{}"))


class OwnerSubnetzeTests(unittest.TestCase):
    def kv(self, key):
        if key == "top_subnets":
            return {"top_subnets": [
                {"netuid": 1, "subnet_name": "Eins", "estimated_emission_daily": 10, "taostats_raw": {"owner": "5OWNER1xxxxxxxx"}},
                {"netuid": 2, "estimated_emission_daily": 50, "taostats_raw": {"owner": {"ss58": "5OWNER2xxxxxxxx"}, "net_flow_7_days": "2000000000"}},
                {"netuid": 3, "estimated_emission_daily": 0, "taostats_raw": {"owner": "5OWNER3"}},
                {"netuid": 4, "estimated_emission_daily": 5, "taostats_raw": {}},
            ]}
        if key == "tao_flow":
            return {"subnets": {"1": {"net_flow_30d_tao": -7.0}}}
        return None

    def test_auswahl_und_sortierung(self):
        with mock.patch.object(owner, "read_from_kv", side_effect=self.kv):
            s = owner.get_all_subnets()
        self.assertEqual([x["netuid"] for x in s], [2, 1])
        self.assertEqual(s[0]["owner"], "5OWNER2xxxxxxxx")
        self.assertEqual(s[0]["name"], "SN2")
        self.assertEqual(s[0]["net_flow_7d"], 2.0)
        self.assertIsNone(s[0]["net_flow_30d"])
        self.assertEqual(s[1]["net_flow_30d"], -7.0)

    def test_ohne_top_subnets_leer(self):
        with still(), mock.patch.object(owner, "read_from_kv", return_value=None):
            self.assertEqual(owner.get_all_subnets(), [])


class OwnerTransferTests(unittest.TestCase):
    def test_nur_juengere_transfers(self):
        daten = {"data": [{"timestamp": iso(5)}, {"timestamp": iso(40)}, {"timestamp": "kaputt"}]}
        with mock.patch.object(owner, "TAOSTATS_API_KEY", "k"), \
                mock.patch.object(owner.requests, "get", create=True, return_value=reqantwort(daten)):
            self.assertEqual(len(owner.fetch_wallet_transfers("5A", days=30)), 1)

    def test_fehlerfaelle_liefern_leere_liste(self):
        with mock.patch.object(owner, "TAOSTATS_API_KEY", None):
            self.assertEqual(owner.fetch_wallet_transfers("5A"), [])
        with mock.patch.object(owner, "TAOSTATS_API_KEY", "k"), still():
            with mock.patch.object(owner.requests, "get", create=True, return_value=reqantwort(None, 429)), \
                    mock.patch.object(owner.time, "sleep"):
                self.assertEqual(owner.fetch_wallet_transfers("5A"), [])
            with mock.patch.object(owner.requests, "get", create=True, return_value=reqantwort(None, 500)):
                self.assertEqual(owner.fetch_wallet_transfers("5A"), [])
            with mock.patch.object(owner.requests, "get", create=True, side_effect=OSError("weg")):
                self.assertEqual(owner.fetch_wallet_transfers("5A"), [])


class OwnerAnalyseTests(unittest.TestCase):
    BINANCE = "5Hd2ze5ug8n1bo3UCAcQsf66VNjKqGos8u6apNfzcU86pg4N"

    def subnet(self, flow30=None):
        return {"netuid": 9, "name": "Neun", "owner": "5OWNERxxxxxxxxxxxx", "emission_daily": 10.0, "net_flow_30d": flow30, "net_flow_7d": None}

    def analyse(self, transfers, flow30=None):
        with mock.patch.object(owner, "fetch_wallet_transfers", return_value=transfers):
            return owner.analyze_owner(self.subnet(flow30))

    def test_stufen(self):
        # Anteil 90 Tage: 10 TAO/Tag * 18 % * 90 = 162 TAO
        for menge, stufe in ((10, "healthy"), (100, "moderate"), (150, "high"), (500, "aggressive")):
            with self.subTest(stufe=stufe):
                r = self.analyse([{"amount": str(int(menge * 1e9)), "to": "5X", "timestamp": iso(60)}])
                self.assertEqual(r["dump_status"], stufe)

    def test_boerse_und_zeitraeume(self):
        r = self.analyse([
            {"amount": str(int(20e9)), "to": {"ss58": self.BINANCE}, "timestamp": iso(3)},
            {"amount": str(int(30e9)), "to": "5Y", "timestamp": iso(60)},
            {"amount": str(int(10e9)), "to": "5Y", "timestamp": "kaputt"},
        ], flow30=-123.4)
        self.assertEqual(r["owner_outflow_30d_tao"], 20.0)
        self.assertEqual(r["owner_outflow_90d_tao"], 60.0)
        self.assertEqual(r["to_exchange_30d_tao"], 20.0)
        self.assertEqual(r["exchanges_used"], ["Binance"])
        self.assertEqual(r["transfer_count_30d"], 1)
        self.assertEqual(r["transfer_count_90d"], 3)
        self.assertEqual(r["net_flow_30d_tao"], -123.0)
        self.assertIsNone(r["net_flow_7d_tao"])
        self.assertEqual(r["owner_short"], "5OWNER...xxxx")

    def test_ohne_transfers(self):
        r = self.analyse([])
        self.assertEqual(r["dump_score"], 0)
        self.assertEqual(r["exchange_percent_90d"], 0)


class OwnerHauptprogrammTests(unittest.TestCase):
    def test_ohne_schluessel_abbruch(self):
        with mock.patch.object(owner, "TAOSTATS_API_KEY", None), still(), self.assertRaises(SystemExit):
            owner.main()

    def test_lauf_schreibt_zusammenfassung(self):
        subnetze = [{"netuid": i, "name": "SN%d" % i, "owner": "5OWNER%dxxxxxxxxx" % i, "emission_daily": 10.0,
                     "net_flow_30d": None, "net_flow_7d": None} for i in range(1, 4)]
        transfers = {"5OWNER1xxxxxxxxx": [], "5OWNER2xxxxxxxxx": [{"amount": str(int(500e9)), "to": "5X", "timestamp": iso(2)}],
                     "5OWNER3xxxxxxxxx": [{"amount": str(int(100e9)), "to": "5X", "timestamp": iso(2)}]}
        with mock.patch.object(owner, "TAOSTATS_API_KEY", "k"), \
                mock.patch.object(owner, "get_all_subnets", return_value=subnetze), \
                mock.patch.object(owner, "fetch_wallet_transfers", side_effect=lambda a, days=30: transfers[a]), \
                mock.patch.object(owner.time, "sleep"), \
                mock.patch.object(owner, "write_to_kv", return_value=True) as schreibe, still() as s:
            owner.main()
        daten = json.loads(s.out.getvalue())
        self.assertEqual(daten["subnets_analyzed"], 3)
        self.assertEqual(daten["subnets"][0]["netuid"], 2)
        self.assertEqual(daten["summary"], {"healthy": 1, "moderate": 1, "high": 0, "aggressive": 1})
        self.assertEqual(schreibe.call_args[0][0], "owner_dump_scores")


# ---------------------------------------------------------------- Top History

class TopKvTests(unittest.TestCase):
    def setUp(self):
        p = [mock.patch.object(top, n, "x") for n in ("CF_ACCOUNT_ID", "CF_API_TOKEN", "CF_KV_NAMESPACE_ID")]
        for x in p:
            x.start()
            self.addCleanup(x.stop)

    def test_lesen(self):
        with mock.patch.object(top.urllib.request, "urlopen", return_value=urlantwort([1, 2])):
            self.assertEqual(top.get_from_kv("k"), [1, 2])
        fehlt = urllib.error.HTTPError("u", 404, "nicht da", {}, None)
        with mock.patch.object(top.urllib.request, "urlopen", side_effect=fehlt):
            self.assertIsNone(top.get_from_kv("k"))
        kaputt = urllib.error.HTTPError("u", 500, "kaputt", {}, None)
        with still(), mock.patch.object(top.urllib.request, "urlopen", side_effect=kaputt):
            self.assertIsNone(top.get_from_kv("k"))
        with still(), mock.patch.object(top.urllib.request, "urlopen", side_effect=OSError("weg")):
            self.assertIsNone(top.get_from_kv("k"))

    def test_schreiben(self):
        with still():
            with mock.patch.object(top.urllib.request, "urlopen", return_value=urlantwort({}, 200)):
                self.assertTrue(top.put_to_kv("k", [1]))
            with mock.patch.object(top.urllib.request, "urlopen", return_value=urlantwort({}, 204)):
                self.assertFalse(top.put_to_kv("k", [1]))
            fehler = urllib.error.HTTPError("u", 403, "verboten", {}, io.BytesIO(b"nein"))
            with mock.patch.object(top.urllib.request, "urlopen", side_effect=fehler):
                self.assertFalse(top.put_to_kv("k", [1]))
            with mock.patch.object(top.urllib.request, "urlopen", side_effect=OSError("weg")):
                self.assertFalse(top.put_to_kv("k", [1]))

    def test_ohne_zugang(self):
        with mock.patch.object(top, "CF_API_TOKEN", None), still():
            self.assertIsNone(top.get_from_kv("k"))
            self.assertFalse(top.put_to_kv("k", [1]))

    def test_nur_https(self):
        with mock.patch.object(top, "API_BASE_URL", "http://unsicher.example"), self.assertRaises(ValueError):
            top.fetch_api("/api/x")


class TopHauptprogrammTests(unittest.TestCase):
    API = {
        "/api/top_validators": {"top_validators": [{"hotkey": "5VALIDATOR1234", "name": "V", "stake": 100}]},
        "/api/top_wallets": {"wallets": [{"address": "5WALLET123456", "balance_total": 50}]},
        "/api/top_subnets": {"top_subnets": [{"netuid": 1, "taostats_name": "Apex", "estimated_emission_daily": 3}]},
        "/api/alpha_prices": {"subnets": [{"netuid": 1, "market_cap_tao": 1000}]},
        "/api/alpha_pressure": {"subnets": [{"netuid": 1, "alpha_pressure_30d": -5, "net_flow_30d_tao": -10}], "summary": {"n": 1}},
    }

    def lauf(self, api, anhaengen=True):
        alt = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                with mock.patch.multiple(top, CF_ACCOUNT_ID="x", CF_API_TOKEN="x", CF_KV_NAMESPACE_ID="x"), \
                        mock.patch.object(top, "fetch_api", side_effect=lambda e: api.get(e)), \
                        mock.patch.object(top, "append_to_history", return_value=anhaengen) as an, \
                        still(), self.assertRaises(SystemExit) as ende:
                    top.main()
                sicherung = json.loads(Path(".github/data/top_history_latest.json").read_text())
            finally:
                os.chdir(alt)
        return ende.exception.code, an, sicherung

    def test_alles_ok(self):
        code, an, sicherung = self.lauf(self.API)
        self.assertEqual(code, 0)
        self.assertEqual(an.call_count, 5)
        self.assertEqual(sicherung["alpha_pressure"]["summary"], {"n": 1})
        self.assertEqual(sicherung["validators"]["entries"][0]["value"], 100.0)

    def test_speichern_scheitert(self):
        code, _, _ = self.lauf(self.API, anhaengen=False)
        self.assertEqual(code, 1)

    def test_leere_und_fehlende_antworten(self):
        leer = {k: {"x": []} for k in self.API}
        code, an, sicherung = self.lauf(leer)
        self.assertEqual(code, 1)
        self.assertEqual(an.call_count, 0)
        self.assertIsNone(sicherung["wallets"])
        code, an, _ = self.lauf({})
        self.assertEqual(code, 1)
        self.assertEqual(an.call_count, 0)

    def test_alpha_druck_ohne_daten_ist_kein_fehler(self):
        api = dict(self.API)
        api["/api/alpha_pressure"] = {"subnets": [{"netuid": 1, "status": "no_data", "alpha_pressure_30d": None}]}
        with mock.patch.object(top, "process_alpha_pressure", return_value=[]):
            code, an, _ = self.lauf(api)
        self.assertEqual(code, 0)
        self.assertEqual(an.call_count, 4)

    def test_ohne_zugang_abbruch(self):
        with mock.patch.object(top, "CF_API_TOKEN", None), still(), self.assertRaises(SystemExit) as ende:
            top.main()
        self.assertEqual(ende.exception.code, 1)


# ---------------------------------------------------------------- Top Wallets

class WalletTests(unittest.TestCase):
    def test_boersen_aus_api_und_ersatzliste(self):
        daten = {"data": [{"coldkey": {"ss58": "5EX1"}, "name": "Eins"}, {"coldkey": "5EX2", "name": "Zwei"}, {"coldkey": "5EX3", "name": ""}]}
        with mock.patch.object(wallets, "TAOSTATS_API_KEY", "k"), still():
            with mock.patch.object(wallets.requests, "get", create=True, return_value=reqantwort(daten)):
                self.assertEqual(wallets.fetch_exchanges(), {"5EX1": "Eins", "5EX2": "Zwei"})
            with mock.patch.object(wallets.requests, "get", create=True, side_effect=OSError("weg")):
                self.assertIn("Binance", wallets.fetch_exchanges().values())
        with mock.patch.object(wallets, "TAOSTATS_API_KEY", None):
            self.assertEqual(wallets.fetch_exchanges(), {})

    def test_leaderboard_fehlerfaelle(self):
        with still():
            with mock.patch.object(wallets, "TAOSTATS_API_KEY", None):
                self.assertIsNone(wallets.fetch_top_wallets())
            with mock.patch.object(wallets, "TAOSTATS_API_KEY", "k"):
                with mock.patch.object(wallets.requests, "get", create=True, return_value=reqantwort({"data": []})):
                    self.assertIsNone(wallets.fetch_top_wallets())
                with mock.patch.object(wallets.requests, "get", create=True, return_value=reqantwort(None, 500)):
                    self.assertIsNone(wallets.fetch_top_wallets())

    def test_identitaeten(self):
        def antwort(url, headers=None, timeout=None):
            if "/5A/" in url:
                return reqantwort({"data": {"name": "Anna"}})
            if "/5B/" in url:
                return reqantwort({"data": [{"display": "Bert"}]})
            if "/5C/" in url:
                return reqantwort(None, 404)
            raise OSError("weg")
        with mock.patch.object(wallets, "TAOSTATS_API_KEY", "k"), still(), \
                mock.patch.object(wallets.requests, "get", create=True, side_effect=antwort):
            r = wallets.fetch_identities(["5A", "5B", "5C", "5D", "5EX"], {"5EX": "Börse"})
        self.assertEqual(r, {"5A": "Anna", "5B": "Bert", "5EX": "Börse"})
        with mock.patch.object(wallets, "TAOSTATS_API_KEY", None):
            self.assertEqual(wallets.fetch_identities(["5A"], {}), {})

    def test_dominanz(self):
        w = wallets.calculate_dominance([{"balance_total": 104000.0}], 10400000)
        self.assertEqual(w[0]["dominance"], 1.0)
        self.assertEqual(wallets.calculate_dominance([{"balance_total": 5.0}], -1)[0]["dominance"], 0)

    def test_hauptprogramm(self):
        liste = [{"rank": 1, "address": "5ADDRESSxxxxxxxx", "address_short": "5ADDRE...xxxx", "balance_total": 104000.0, "identity": None},
                 {"rank": 2, "address": "5OTHERxxxxxxxxxx", "address_short": "5OTHER...xxxx", "balance_total": 10.0, "identity": None}]
        alt = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                with mock.patch.object(wallets, "fetch_exchanges", return_value={}), \
                        mock.patch.object(wallets, "fetch_top_wallets", return_value=liste), \
                        mock.patch.object(wallets, "fetch_identities", return_value={"5ADDRESSxxxxxxxx": "Anna"}), \
                        mock.patch.dict(os.environ, {"CIRCULATING_SUPPLY": "10400000"}), still() as s:
                    wallets.main()
                datei = json.loads(Path("top_wallets.json").read_text())
            finally:
                os.chdir(alt)
        ausgabe = json.loads(s.out.getvalue().strip().splitlines()[-1])
        self.assertEqual(datei, ausgabe)
        self.assertEqual(datei["wallets"][0]["identity"], "Anna")
        self.assertEqual(datei["wallets"][0]["dominance"], 1.0)
        self.assertEqual(datei["_timestamp"], datei["last_updated"])

    def test_hauptprogramm_ohne_daten(self):
        with mock.patch.object(wallets, "fetch_exchanges", return_value={}), \
                mock.patch.object(wallets, "fetch_top_wallets", return_value=None), still(), self.assertRaises(SystemExit):
            wallets.main()


# ---------------------------------------------------------------- KV-Fallback

class KvFallbackTests(unittest.TestCase):
    def test_zeitfelder_bleiben_echt(self):
        daten = {"last_updated": "2026-01-01T00:00:00Z", "_timestamp": "2026-01-01T00:00:00Z", "last_issuance_ts": 123}
        with still(), mock.patch.object(kvf.urllib.request, "urlopen", return_value=urlantwort(daten)):
            r = kvf.get_from_kv("a", "t", "n", "k")
        self.assertEqual(r["last_updated"], "2026-01-01T00:00:00Z")
        self.assertEqual(r["_timestamp"], "2026-01-01T00:00:00Z")
        self.assertEqual(r["last_issuance_ts"], 123)
        self.assertTrue(r["_fallback_used"])

    def test_fehlerfaelle(self):
        with still():
            with mock.patch.object(kvf.urllib.request, "urlopen", return_value=urlantwort({}, 204)):
                self.assertIsNone(kvf.get_from_kv("a", "t", "n", "k"))
            for code in (404, 500):
                with mock.patch.object(kvf.urllib.request, "urlopen", side_effect=urllib.error.HTTPError("u", code, "x", {}, None)):
                    self.assertIsNone(kvf.get_from_kv("a", "t", "n", "k"))
            with mock.patch.object(kvf.urllib.request, "urlopen", side_effect=OSError("weg")):
                self.assertIsNone(kvf.get_from_kv("a", "t", "n", "k"))

    def test_hauptprogramm(self):
        umgebung = {"CF_ACCOUNT_ID": "a", "CF_API_TOKEN": "t", "CF_KV_NAMESPACE_ID": "n"}
        with mock.patch.object(sys, "argv", ["kv_fallback.py"]), still(), self.assertRaises(SystemExit) as e:
            kvf.main()
        self.assertEqual(e.exception.code, 1)
        with mock.patch.object(sys, "argv", ["kv_fallback.py", "k"]), mock.patch.dict(os.environ, {}, clear=True), \
                still(), self.assertRaises(SystemExit) as e:
            kvf.main()
        self.assertEqual(e.exception.code, 1)
        for rueck, code in (({"a": 1}, 0), (None, 1)):
            with mock.patch.object(sys, "argv", ["kv_fallback.py", "k"]), mock.patch.dict(os.environ, umgebung), \
                    mock.patch.object(kvf, "get_from_kv", return_value=rueck), still(), self.assertRaises(SystemExit) as e:
                kvf.main()
            self.assertEqual(e.exception.code, code)


# ---------------------------------------------------------------- ATH/ATL und Taostats-Preis

class AthAtlTests(unittest.TestCase):
    def lauf(self, antwort):
        alt = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                with mock.patch.object(ath.requests, "get", create=True, **antwort), still():
                    try:
                        ath.fetch_ath_atl()
                        code = 0
                    except SystemExit as e:
                        code = e.code
                dateien = sorted(os.listdir("."))
                daten = json.loads(Path("tao_ath_atl.json").read_text()) if "tao_ath_atl.json" in dateien else None
            finally:
                os.chdir(alt)
        return code, dateien, daten

    def test_erfolg_schreibt_datei_und_sicherung(self):
        md = {"market_data": {"ath": {"usd": 760.0}, "ath_date": {"usd": "2024-03-07"}, "atl": {"usd": 30.0}, "atl_date": {"usd": "2023-05-14"}}}
        code, dateien, daten = self.lauf({"return_value": reqantwort(md)})
        self.assertEqual(code, 0)
        self.assertEqual(daten["ath"], 760.0)
        self.assertEqual(daten["atl_date"], "2023-05-14")
        self.assertTrue(any(f.startswith("tao_ath_atl-") for f in dateien))

    def test_ohne_werte_keine_datei(self):
        code, dateien, _ = self.lauf({"return_value": reqantwort({"market_data": {}})})
        self.assertEqual(code, 1)
        self.assertEqual(dateien, [])
        code, dateien, _ = self.lauf({"side_effect": OSError("weg")})
        self.assertEqual(code, 1)
        self.assertEqual(dateien, [])


class TaostatsAbrufTests(unittest.TestCase):
    def test_ohne_schluessel_abbruch(self):
        with mock.patch.object(taostats, "TAOSTATS_API_KEY", None), still(), self.assertRaises(SystemExit):
            taostats.fetch_taostats()

    def test_dauerhaft_gedrosselt(self):
        with mock.patch.object(taostats, "TAOSTATS_API_KEY", "k"), mock.patch.object(taostats.time, "sleep") as warte, \
                mock.patch.object(taostats.requests, "get", create=True, return_value=reqantwort(None, 429)), still():
            self.assertIsNone(taostats.fetch_taostats())
        self.assertEqual(warte.call_count, taostats.MAX_RETRIES - 1)

    def test_leere_antwort(self):
        with mock.patch.object(taostats, "TAOSTATS_API_KEY", "k"), still(), \
                mock.patch.object(taostats.requests, "get", create=True, return_value=reqantwort({"data": []})):
            self.assertIsNone(taostats.fetch_taostats())

    def test_umgebungswerte(self):
        with mock.patch.dict(os.environ, {"W1": " 12 ", "W2": "", "W3": "abc"}), still():
            self.assertEqual(taostats._int_env("W1", 5), 12)
            self.assertEqual(taostats._int_env("W2", 5), 5)
            self.assertEqual(taostats._int_env("W3", 5), 5)
            self.assertEqual(taostats._int_env("FEHLT_GANZ", 5), 5)


if __name__ == "__main__":
    unittest.main()
