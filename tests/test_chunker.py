from api.core.chunker import TextChunk, clamp_max_chars, split_text


def test_split_text_empty_returns_no_chunks():
    assert split_text("   ", max_chars=100) == []


def test_split_text_short_script_stays_single_chunk():
    assert split_text("Hello world.", max_chars=100) == [TextChunk("Hello world.", 0.0)]


def test_split_text_respects_headroom_and_sentence_boundaries():
    text = "First sentence is tidy. Second sentence is also tidy. Third sentence closes it out."

    chunks = split_text(text, max_chars=60, headroom_chars=10)

    assert len(chunks) >= 2
    assert all(len(chunk.text) <= 50 for chunk in chunks)
    assert chunks[0].pause_after_s > 0


def test_clamp_max_chars():
    assert clamp_max_chars(None, default=450, minimum=100, maximum=3000) == 450
    assert clamp_max_chars(10, default=450, minimum=100, maximum=3000) == 100
    assert clamp_max_chars(9999, default=450, minimum=100, maximum=3000) == 3000
    assert clamp_max_chars(777, default=450, minimum=100, maximum=3000) == 777
