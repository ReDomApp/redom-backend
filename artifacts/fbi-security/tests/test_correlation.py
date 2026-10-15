from app.correlation import correlate_cases, explicit_case_ids

def test_explicit_case_id_extraction():
    ids = explicit_case_ids("The DOJ announced case no. 24-CR-120 and docket #23-114.")
    assert "24-CR-120" in ids
    assert "23-114" in ids

def test_exact_title_group_requires_review():
    cases = [
        {"id": "a", "title": "Official enforcement action involving Example LLC", "summary": "", "content_sha256": "one"},
        {"id": "b", "title": "Official enforcement action involving Example LLC", "summary": "", "content_sha256": "two"},
    ]
    assert any(g["match_type"] == "exact_normalized_title" and g["requires_human_review"] for g in correlate_cases(cases))

def test_similar_titles_not_correlated_by_name():
    cases = [
        {"id": "a", "title": "Wanted: John Sample", "summary": "", "content_sha256": "one"},
        {"id": "b", "title": "Wanted: John Sampler", "summary": "", "content_sha256": "two"},
    ]
    assert correlate_cases(cases) == []
