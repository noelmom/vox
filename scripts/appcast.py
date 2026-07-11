#!/usr/bin/env python3
"""Render and verify local Sparkle bare-package appcast candidates.

This tool has deliberately no publishing capability. Release automation stages a
package and notes first, then uses this local output as evidence before a
separate, explicitly approved publication step.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

SPARKLE = "http://www.andymatuschak.org/xml-namespaces/sparkle"
ET.register_namespace("sparkle", SPARKLE)
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$")
SIGNATURE = re.compile(r'sparkle:edSignature="([^"]+)"\s+length="(\d+)"')


def fail(message: str) -> "None":
    raise SystemExit(f"appcast: {message}")


def valid_url(url: str, version: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        fail("package URL must be an absolute HTTPS URL")
    if not parsed.path.endswith(f"/Vox-{version}.pkg"):
        fail("package URL must use the immutable Vox-<version>.pkg filename")


def signature_for(package: Path, tool: Path, account: str) -> tuple[str, int]:
    if not tool.is_file():
        fail(f"Sparkle sign_update tool not found: {tool}")
    result = subprocess.run(
        [str(tool), "--account", account, str(package)], text=True, capture_output=True, check=False
    )
    if result.returncode:
        fail(f"Sparkle signing failed: {result.stderr.strip() or result.stdout.strip()}")
    match = SIGNATURE.search(result.stdout)
    if not match:
        fail("could not parse Sparkle signature output")
    return match.group(1), int(match.group(2))


def verify_signature(package: Path, signature: str, tool: Path, account: str) -> None:
    if not tool.is_file():
        fail(f"Sparkle sign_update tool not found: {tool}")
    result = subprocess.run(
        [str(tool), "--verify", "--account", account, str(package), signature],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        fail(f"Sparkle signature verification failed: {result.stderr.strip() or result.stdout.strip()}")


def existing_items(appcast: Path | None, build: str, channel: str, short_version: str) -> list[ET.Element]:
    if appcast is None:
        return []
    try:
        root = ET.parse(appcast).getroot()
    except (OSError, ET.ParseError) as error:
        fail(f"invalid --existing-appcast: {error}")
    if root.find("./channel") is None:
        fail("--existing-appcast needs an RSS channel")
    items = root.findall("./channel/item")
    if items:
        verify_file(appcast, None, None, None)
    highest_build = 0
    for item in items:
        existing_build = item.findtext(f"{{{SPARKLE}}}version")
        existing_version = item.findtext(f"{{{SPARKLE}}}shortVersionString")
        existing_channel = item.findtext(f"{{{SPARKLE}}}channel") or "stable"
        if not existing_build or not existing_build.isdecimal() or int(existing_build) <= 0:
            fail("--existing-appcast contains an invalid sparkle build number")
        if channel == "stable" and existing_channel == "stable" and existing_version == short_version:
            fail("stable appcast already contains this short version; bump the release version before publishing")
        highest_build = max(highest_build, int(existing_build))
    if int(build) <= highest_build:
        fail("--build must be greater than every build in --existing-appcast")
    return items


def make_item(args: argparse.Namespace, signature: str, length: int, notes: str) -> ET.Element:
    item = ET.Element("item")
    ET.SubElement(item, "title").text = f"Vox {args.version}"
    ET.SubElement(item, f"{{{SPARKLE}}}version").text = args.build
    ET.SubElement(item, f"{{{SPARKLE}}}shortVersionString").text = args.version
    try:
        published_at = dt.datetime.fromisoformat(args.published_at.replace("Z", "+00:00"))
    except ValueError:
        fail("--published-at must be an ISO-8601 timestamp")
    ET.SubElement(item, "pubDate").text = published_at.astimezone(dt.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    description = ET.SubElement(item, "description", {f"{{{SPARKLE}}}format": "markdown"})
    description.text = notes
    if args.channel == "beta":
        ET.SubElement(item, f"{{{SPARKLE}}}channel").text = "beta"
    ET.SubElement(item, "enclosure", {
        "url": args.url,
        "length": str(length),
        "type": "application/octet-stream",
        f"{{{SPARKLE}}}edSignature": signature,
    })
    return item


def render(args: argparse.Namespace) -> None:
    package = args.package.resolve()
    if not package.is_file() or package.suffix != ".pkg":
        fail("--package must be an existing .pkg file")
    if not SEMVER.match(args.version):
        fail("--version must be semantic version text")
    if not args.build.isdecimal() or int(args.build) <= 0:
        fail("--build must be a positive monotonic integer")
    if args.previous_build is None and not args.fixture:
        fail("--previous-build is required for a release candidate")
    if args.previous_build is not None and int(args.build) <= args.previous_build:
        fail("--build must be greater than --previous-build")
    valid_url(args.url, args.version)
    if package.name != f"Vox-{args.version}.pkg":
        fail("package filename must match --version")
    notes = args.notes.read_text(encoding="utf-8").strip()
    if not notes:
        fail("release notes must not be empty")
    if args.signature and not args.fixture:
        fail("--signature is only available with --fixture; release candidates use Keychain signing")
    if args.signature:
        signature, length = args.signature, package.stat().st_size
    else:
        signature, length = signature_for(package, args.sign_tool, args.account)
    if length != package.stat().st_size:
        fail("Sparkle-reported package length does not match the staged package")

    prior_items = existing_items(args.existing_appcast, args.build, args.channel, args.version)
    rss = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "Vox updates"
    channel.append(make_item(args, signature, length, notes))
    channel.extend(prior_items)
    ET.indent(rss, space="  ")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(rss).write(args.output, encoding="utf-8", xml_declaration=True)
    verify_file(
        args.output,
        package,
        args.channel,
        args.previous_build,
        expected_build=args.build,
        verify_sparkle_signature=not args.fixture,
        sign_tool=args.sign_tool,
        account=args.account,
    )


def verify_file(
    appcast: Path,
    package: Path | None,
    expected_channel: str | None,
    previous_build: int | None,
    *,
    expected_build: str | None = None,
    expected_package_url: str | None = None,
    expected_signature: str | None = None,
    expected_length: int | None = None,
    verify_sparkle_signature: bool = False,
    sign_tool: Path | None = None,
    account: str | None = None,
) -> None:
    try:
        root = ET.parse(appcast).getroot()
    except ET.ParseError as error:
        fail(f"invalid XML: {error}")
    items = root.findall("./channel/item")
    if not items:
        fail("appcast needs one channel item")
    seen_builds: set[str] = set()
    for candidate in items:
        candidate_build = candidate.findtext(f"{{{SPARKLE}}}version")
        candidate_version = candidate.findtext(f"{{{SPARKLE}}}shortVersionString")
        candidate_channel = candidate.findtext(f"{{{SPARKLE}}}channel") or "stable"
        candidate_enclosure = candidate.find("enclosure")
        if not candidate_build or not candidate_build.isdecimal() or int(candidate_build) <= 0:
            fail("invalid sparkle build number")
        if candidate_build in seen_builds:
            fail("appcast contains duplicate sparkle build numbers")
        seen_builds.add(candidate_build)
        if not candidate_version or not SEMVER.match(candidate_version):
            fail("invalid short version")
        if candidate_channel not in {"stable", "beta"}:
            fail("channel must be stable or beta")
        if candidate_enclosure is None:
            fail("missing package enclosure")
        valid_url(candidate_enclosure.get("url", ""), candidate_version)
        if not candidate_enclosure.get(f"{{{SPARKLE}}}edSignature", ""):
            fail("missing Sparkle EdDSA signature")
        try:
            candidate_length = int(candidate_enclosure.get("length", "0"))
        except ValueError:
            fail("invalid enclosure length")
        if candidate_length <= 0:
            fail("invalid enclosure length")
        relevant_channel = candidate_channel == expected_channel or (
            expected_channel == "beta" and candidate_channel == "stable"
        )
        if expected_build is not None and relevant_channel and int(candidate_build) > int(expected_build):
            fail("appcast contains a newer update in the selected channel")
    item = next(
        (candidate for candidate in items if candidate.findtext(f"{{{SPARKLE}}}version") == expected_build),
        None,
    ) if expected_build is not None else items[0]
    if item is None:
        fail("expected sparkle build was not found in appcast")
    version = item.findtext(f"{{{SPARKLE}}}version")
    short_version = item.findtext(f"{{{SPARKLE}}}shortVersionString")
    channel = item.findtext(f"{{{SPARKLE}}}channel") or "stable"
    enclosure = item.find("enclosure")
    if not version or not version.isdecimal() or int(version) <= 0:
        fail("invalid sparkle build number")
    if expected_build is not None and version != expected_build:
        fail("unexpected sparkle build number")
    if previous_build is not None and int(version) <= previous_build:
        fail("appcast build is not newer than the previous build")
    if not short_version or not SEMVER.match(short_version):
        fail("invalid short version")
    if expected_channel and channel != expected_channel:
        fail("unexpected appcast channel")
    if channel not in {"stable", "beta"}:
        fail("channel must be stable or beta")
    if enclosure is None:
        fail("missing package enclosure")
    url = enclosure.get("url", "")
    valid_url(url, short_version)
    if expected_package_url is not None and url != expected_package_url:
        fail("unexpected package enclosure URL")
    signature = enclosure.get(f"{{{SPARKLE}}}edSignature", "")
    if not signature:
        fail("missing Sparkle EdDSA signature")
    if expected_signature is not None and signature != expected_signature:
        fail("unexpected Sparkle EdDSA signature")
    try:
        length = int(enclosure.get("length", "0"))
    except ValueError:
        fail("invalid enclosure length")
    if length <= 0:
        fail("invalid enclosure length")
    if expected_length is not None and length != expected_length:
        fail("unexpected enclosure length")
    if package is not None:
        if not package.is_file() or package.suffix != ".pkg":
            fail("--package must be an existing .pkg file")
        if length != package.stat().st_size:
            fail("enclosure length does not match local package")
    if verify_sparkle_signature:
        if package is None:
            fail("--verify-signature requires --package")
        if sign_tool is None or account is None:
            fail("--verify-signature requires a Sparkle signing tool and account")
        verify_signature(package, signature, sign_tool, account)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    render_parser = commands.add_parser("render")
    render_parser.add_argument("--version", required=True)
    render_parser.add_argument("--build", required=True)
    render_parser.add_argument("--previous-build", type=int)
    render_parser.add_argument("--published-at", required=True, help="fixed ISO-8601 release timestamp")
    render_parser.add_argument("--channel", choices=("stable", "beta"), default="stable")
    render_parser.add_argument("--package", type=Path, required=True)
    render_parser.add_argument("--url", required=True)
    render_parser.add_argument("--notes", type=Path, required=True)
    render_parser.add_argument("--output", type=Path, required=True)
    render_parser.add_argument("--existing-appcast", type=Path, help="merge the new item ahead of this single existing feed")
    render_parser.add_argument("--signature", help="fixture-only signature; production calls sign_update")
    render_parser.add_argument("--fixture", action="store_true", help="allow deterministic test fixtures without Keychain signing")
    render_parser.add_argument("--sign-tool", type=Path, default=Path(".build/artifacts/sparkle/Sparkle/bin/sign_update"))
    render_parser.add_argument("--account", default="com.noelmom.vox")
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("--appcast", type=Path, required=True)
    verify_parser.add_argument("--package", type=Path)
    verify_parser.add_argument("--channel", choices=("stable", "beta"))
    verify_parser.add_argument("--build", help="require this exact sparkle build number")
    verify_parser.add_argument("--package-url", help="require this exact enclosure URL")
    verify_parser.add_argument("--expected-signature", help="require this exact enclosure EdDSA signature")
    verify_parser.add_argument("--expected-length", type=int, help="require this exact enclosure length")
    verify_parser.add_argument("--previous-build", type=int)
    verify_parser.add_argument("--verify-signature", action="store_true", help="validate the enclosure signature with Sparkle")
    verify_parser.add_argument("--sign-tool", type=Path, default=Path(".build/artifacts/sparkle/Sparkle/bin/sign_update"))
    verify_parser.add_argument("--account", default="com.noelmom.vox")
    args = parser.parse_args()
    if args.command == "render":
        render(args)
    else:
        verify_file(
            args.appcast,
            args.package,
            args.channel,
            args.previous_build,
            expected_build=args.build,
            expected_package_url=args.package_url,
            expected_signature=args.expected_signature,
            expected_length=args.expected_length,
            verify_sparkle_signature=args.verify_signature,
            sign_tool=args.sign_tool,
            account=args.account,
        )


if __name__ == "__main__":
    main()
