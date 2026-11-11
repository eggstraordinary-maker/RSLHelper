"""Separate line and branch gates over the full application coverage XML."""
import argparse
import xml.etree.ElementTree as ET


def check(path, lines, branches):
    coverage = ET.parse(path).getroot()
    line = float(coverage.attrib["line-rate"]) * 100
    branch = float(coverage.attrib["branch-rate"]) * 100
    print(f"Backend coverage: lines={line:.2f}% (minimum {lines}%), branches={branch:.2f}% (minimum {branches}%)")
    return line + 1e-6 >= lines and branch + 1e-6 >= branches


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--lines", type=float, default=80)
    parser.add_argument("--branches", type=float, default=60)
    args = parser.parse_args()
    raise SystemExit(0 if check(args.path, args.lines, args.branches) else 1)
