from scripts.check_coverage import check


def test_line_and_branch_gates_fail_independently(tmp_path):
    path = tmp_path / "coverage.xml"
    path.write_text('<coverage line-rate="0.90" branch-rate="0.59"/>')
    assert not check(path, 80, 60)
    path.write_text('<coverage line-rate="0.79" branch-rate="0.90"/>')
    assert not check(path, 80, 60)
    path.write_text('<coverage line-rate="0.80" branch-rate="0.60"/>')
    assert check(path, 80, 60)
