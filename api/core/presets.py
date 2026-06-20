PRESETS: dict[str, dict] = {
    "default": {
        "temperature": 0.8,
        "exaggeration": 0.5,
        "cfg_weight": 0.5,
        "repetition_penalty": 1.2,
        "top_p": 1.0,
        "min_p": 0.05,
    },
    "youtube": {
        "temperature": 0.75,
        "exaggeration": 0.55,
        "cfg_weight": 0.6,
        "repetition_penalty": 1.2,
        "top_p": 0.9,
        "min_p": 0.05,
    },
    "hype": {
        "temperature": 0.9,
        "exaggeration": 0.9,
        "cfg_weight": 0.6,
        "repetition_penalty": 1.3,
        "top_p": 0.95,
        "min_p": 0.05,
    },
    "news": {
        "temperature": 0.4,
        "exaggeration": 0.2,
        "cfg_weight": 0.7,
        "repetition_penalty": 1.1,
        "top_p": 0.8,
        "min_p": 0.05,
    },
}
