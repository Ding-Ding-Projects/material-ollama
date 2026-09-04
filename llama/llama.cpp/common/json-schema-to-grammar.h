#pragma once

#include <nlohmann/json_fwd.hpp>

#include <functional>
#include <string>

std::string json_schema_to_grammar(const nlohmann::ordered_json& schema);
