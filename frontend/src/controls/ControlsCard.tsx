import {Box, Grid2, Paper, Skeleton, SvgIconProps, Typography} from "@mui/material";
import React, {ReactNode} from "react";
import LoadingFade from "../components/LoadingFade";


interface ControlsCardProps {
    icon: React.ComponentType<SvgIconProps>;
    title: string;
    subtitle?: string;
    pending?: boolean;
    children: ReactNode;
    isLoading?: boolean;
    headerExtra?: ReactNode;
    inline?: boolean;
}

const ControlsCard: React.FC<ControlsCardProps> = ({
    icon: Icon,
    title,
    subtitle,
    pending = false,
    children,
    isLoading,
    headerExtra,
    inline = false,
}) => (
    <Grid2>
        <Paper>
            <Grid2 container direction="column">
                <Box px={1.5} py={1.5}>
                    <Grid2 container alignItems="center" spacing={1}>
                        {inline ? (
                            <Grid2 display="flex" alignItems="center" justifyContent="center">
                                <Icon fontSize="small" />
                            </Grid2>
                        ) : (
                            <Grid2><Icon fontSize="medium" /></Grid2>
                        )}
                        <Grid2 sx={inline ? {paddingTop: 0} : {marginTop: "-8px"}}>
                            <Typography variant="subtitle1">
                                {title}
                                {!inline && subtitle && (
                                    <Typography component="span" variant="body2" color="text.secondary" sx={{textTransform: "uppercase", letterSpacing: "0.05em"}}>
                                        {" \u2014 "}{subtitle}
                                    </Typography>
                                )}
                            </Typography>
                        </Grid2>
                        {inline ? (
                            <Grid2 display="flex" justifyContent="end" size="grow">
                                {isLoading ? <Skeleton height="4rem" /> : children}
                            </Grid2>
                        ) : (
                            <Grid2>
                                <LoadingFade
                                    in={pending}
                                    transitionDelay={pending ? "500ms" : "0ms"}
                                    size={20}
                                />
                            </Grid2>
                        )}
                        {headerExtra && (
                            <Grid2
                                display="flex"
                                alignItems="center"
                                sx={inline ? {} : {marginLeft: "auto", marginTop: "-8px"}}
                            >
                                {headerExtra}
                            </Grid2>
                        )}
                    </Grid2>
                    {!inline && (
                        <Grid2 px={0.5}>
                            {isLoading ? <Skeleton height="4rem" /> : children}
                        </Grid2>
                    )}
                </Box>
            </Grid2>
        </Paper>
    </Grid2>
);

export default ControlsCard;
