# Recalcula rankings somados
scoreboard players set @a rank_minerios 0
scoreboard players set @a rank_diamantes_total 0
scoreboard players set @a rank_atm_total 0
scoreboard players set @a rank_vib_total 0
scoreboard players set @a rank_horas 0
execute as @a run scoreboard players operation @s rank_horas = @s rank_tempo
execute as @a run scoreboard players operation @s rank_horas /= #ticks_por_hora rank_tmp
execute as @a run scoreboard players operation @s rank_minerios += @s rank_diamond
execute as @a run scoreboard players operation @s rank_minerios += @s rank_diamond_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_ancient
execute as @a run scoreboard players operation @s rank_minerios += @s rank_allthemodium
execute as @a run scoreboard players operation @s rank_minerios += @s rank_allthemodium_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_vibranium
execute as @a run scoreboard players operation @s rank_minerios += @s rank_vibranium_other
execute as @a run scoreboard players operation @s rank_minerios += @s rank_unobtainium
execute as @a run scoreboard players operation @s rank_minerios += @s rank_iron
execute as @a run scoreboard players operation @s rank_minerios += @s rank_iron_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_gold
execute as @a run scoreboard players operation @s rank_minerios += @s rank_gold_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_redstone
execute as @a run scoreboard players operation @s rank_minerios += @s rank_redstone_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_emerald
execute as @a run scoreboard players operation @s rank_minerios += @s rank_emerald_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_coal
execute as @a run scoreboard players operation @s rank_minerios += @s rank_coal_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_lapis
execute as @a run scoreboard players operation @s rank_minerios += @s rank_lapis_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_copper
execute as @a run scoreboard players operation @s rank_minerios += @s rank_copper_deep
execute as @a run scoreboard players operation @s rank_minerios += @s rank_quartz
execute as @a run scoreboard players operation @s rank_diamantes_total += @s rank_diamond
execute as @a run scoreboard players operation @s rank_diamantes_total += @s rank_diamond_deep
execute as @a run scoreboard players operation @s rank_atm_total += @s rank_allthemodium
execute as @a run scoreboard players operation @s rank_atm_total += @s rank_allthemodium_deep
execute as @a run scoreboard players operation @s rank_vib_total += @s rank_vibranium
execute as @a run scoreboard players operation @s rank_vib_total += @s rank_vibranium_other
